"""图拓扑的结构测试。

为什么用结构测试替代启发式单测：`_should_wait_for_human_approval`（靠状态形状反推
「是否在等审批」）与 `_raise_if_loop_budget_exhausted`（看管手写外层 while 的循环
预算）在 B3 中已删除。它们守护的不变量并没有消失，而是改由**图结构**与**原生
recursion_limit** 保证——结构测试因此是更强的保证方式：拓扑一旦被改动，这里立刻失败。

C2（2026-09-13）后拓扑 = 波次扇出：

    router → {direct_reply | commander → plan_approval → wave_dispatch}
    wave_dispatch ──Send──▶ expert_worker（执行子图）──▶ task_join
         ▲                                                   │
         └───────────────────────────────────────────────────┘
    wave_dispatch（无就绪任务）→ aggregator → END

被守护的不变量：
1. 存在独立的 `plan_approval` 审批节点
2. 规划完成后**必经**审批（commander → plan_approval → wave_dispatch）
3. 任务波次推进的回路（task_join → wave_dispatch）**不经过**审批节点，
   因此「批准后不会再次询问」由图形状保证，无需运行时位置判断
4. 不再使用静态中断（interrupt_before）——它是旧一族 workaround 的总根源
5. 节点级超时只给「挂了整轮无救」的节点（commander / aggregator），
   专家执行（子图）**不在内**——见 TestNodeLevelTimeout 的说明
6. 执行侧没有 `current_task_index` 游标 / 无 reducer 的并发写入通道（见
   TestConcurrencySafety）——这两条一旦回归，并发扇出会直接报错或串味
"""

import pytest
from langgraph.graph import StateGraph

from agents.graph_builder import create_smart_router_workflow


@pytest.fixture(scope="module")
def compiled_graph():
    return create_smart_router_workflow()


def _edges(graph) -> set[tuple[str, str]]:
    g = graph.get_graph()
    return {(e.source, e.target) for e in g.edges}


class TestPlanApprovalTopology:
    def test_plan_approval_node_exists(self, compiled_graph):
        assert "plan_approval" in compiled_graph.get_graph().nodes

    def test_commander_goes_through_approval(self, compiled_graph):
        edges = _edges(compiled_graph)
        assert ("commander", "plan_approval") in edges
        assert ("plan_approval", "wave_dispatch") in edges
        assert ("commander", "wave_dispatch") not in edges, "规划后不得绕过审批直接分发"

    def test_wave_loop_bypasses_approval(self, compiled_graph):
        """批准后波次推进不得再回到审批节点——否则会变成「每波都问一次」。"""
        edges = _edges(compiled_graph)
        assert ("task_join", "wave_dispatch") in edges
        assert ("task_join", "plan_approval") not in edges
        assert ("wave_dispatch", "plan_approval") not in edges

    def test_wave_fanout_and_join(self, compiled_graph):
        """扇出到执行子图、等本轮全部完成再落状态。"""
        edges = _edges(compiled_graph)
        assert ("wave_dispatch", "expert_worker") in edges
        assert ("expert_worker", "task_join") in edges
        assert ("wave_dispatch", "aggregator") in edges, "没有就绪任务时必须能收尾"
        assert ("aggregator", "__end__") in edges

    def test_no_legacy_cursor_nodes_left(self, compiled_graph):
        """旧的 dispatcher / generic / tools 主图节点必须已删除。"""
        nodes = set(compiled_graph.get_graph().nodes)
        for gone in ("expert_dispatcher", "generic"):
            assert gone not in nodes, f"{gone} 已随 C2 删除（职责并入 wave_dispatch/子图）"

    def test_simple_mode_never_enters_approval(self, compiled_graph):
        """简单模式（direct_reply）不经过审批。"""
        edges = _edges(compiled_graph)
        assert ("direct_reply", "__end__") in edges
        assert ("direct_reply", "plan_approval") not in edges

    def test_no_static_interrupt_left(self, compiled_graph):
        """不得残留 interrupt_before 静态中断。"""
        compiled = compiled_graph
        # 静态中断会记录在编译产物的 interrupt_before_nodes 上（空=无）
        assert not getattr(compiled, "interrupt_before_nodes", None), (
            "interrupt_before 已废弃，审批应走 plan_approval 节点的 interrupt()"
        )


class TestConcurrencySafety:
    """并发扇出的两条硬约束（实测得出，回归即炸整轮）。"""

    @staticmethod
    def _channels(schema) -> dict:
        """解析出每个通道的规约（reducer），与 LangGraph 读 schema 的方式一致。

        不能直接读 `__annotations__`：模块开了 `from __future__ import annotations`
        （注释是字符串/ForwardRef），Annotated 的元数据要先解析才看得见。
        """
        from typing import get_type_hints

        return get_type_hints(schema, include_extras=True)

    def test_no_cursor_channel(self):
        """`current_task_index` 不得回归：它与波次判定是两套「下一个是谁」。"""
        from agents.state import AgentState

        assert "current_task_index" not in self._channels(AgentState)

    def test_branch_only_writes_reducer_channels(self):
        """分支能写的通道必须都有 reducer（否则并发写直接 InvalidUpdateError）。"""
        from agents.expert_worker import ExpertWorkerState
        from agents.state import merge_task_outcomes

        channels = self._channels(ExpertWorkerState)
        # Annotated[X, reducer] 的元数据挂在 __metadata__ 上（reducer 在第 0 位）
        assert channels["task_outcomes"].__metadata__[0] is merge_task_outcomes
        # worker_messages 是分支私有草稿，用 add_messages 累积（同样有 reducer）
        assert channels["worker_messages"].__metadata__, (
            "分支私有草稿也必须是带 reducer 的通道（同节点重入会写它）"
        )

    def test_parent_task_list_has_no_reducer(self):
        """`task_list` 必须保持「无 reducer」：计划编辑依赖整表替换语义。"""
        from agents.state import AgentState

        assert not hasattr(self._channels(AgentState)["task_list"], "__metadata__"), (
            "给 task_list 加 reducer 会破坏计划编辑（编辑后的新行 key 不同→变追加重复项）"
        )

    def test_parent_outcome_channel_uses_same_reducer_as_branch(self):
        """主图与子图的同名通道必须用**同一个**合并规约（否则扇入时静默丢产物）。"""
        from agents.expert_worker import ExpertWorkerState
        from agents.state import AgentState

        parent = self._channels(AgentState)["task_outcomes"].__metadata__[0]
        branch = self._channels(ExpertWorkerState)["task_outcomes"].__metadata__[0]
        assert parent is branch


class TestNodeLevelTimeout:
    """节点级超时（TimeoutPolicy）的接线范围。

    守护的不变量：**只有「挂了整轮无救」的节点有节点级超时**。
    - commander：规划悬挂 → 无计划可批
    - aggregator：聚合悬挂 → 无最终产出
    - **专家执行（expert_worker）必须没有**：节点级超时会把整个 run 杀掉，而单个专家
      慢/挂时正确的语义是「该任务失败、其余任务继续」。超时放在节点内部
      （asyncio.timeout 包 LLM 调用 → ExpertExecutionError → failed 产物）。

    测试方式：记录 `StateGraph.add_node` 实际收到的 timeout 参数——测真实接线，
    而不是测某个常量的内容。
    """

    def _recorded_timeouts(self, monkeypatch) -> dict:
        recorded: dict = {}
        original = StateGraph.add_node

        def _recording(self, node, action, **kwargs):
            recorded[node] = kwargs.get("timeout")
            return original(self, node, action, **kwargs)

        monkeypatch.setattr(StateGraph, "add_node", _recording)
        create_smart_router_workflow()
        return recorded

    def test_commander_has_node_timeout(self, monkeypatch):
        assert self._recorded_timeouts(monkeypatch)["commander"] is not None

    def test_aggregator_has_node_timeout(self, monkeypatch):
        assert self._recorded_timeouts(monkeypatch)["aggregator"] is not None

    def test_expert_worker_has_no_node_timeout(self, monkeypatch):
        timeout = self._recorded_timeouts(monkeypatch)["expert_worker"]
        assert timeout is None, (
            "专家执行不得使用节点级超时——那会让单个慢任务拖死整轮；"
            "它的超时应在节点内部以任务级失败处理"
        )

    def test_timeout_budget_sits_between_call_and_run_limits(self):
        """超时预算需 >0 且小于 run 级执行预算，否则形同虚设。"""
        from config import settings

        assert 0 < settings.llm_call_timeout_seconds < settings.run_deadline_seconds
