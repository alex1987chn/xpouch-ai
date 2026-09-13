"""图拓扑的结构测试（批次 B3）。

为什么用结构测试替代原来的启发式单测：`_should_wait_for_human_approval`
（靠状态形状反推「是否在等审批」）与 `_raise_if_loop_budget_exhausted`
（看管手写外层 while 的循环预算）在 B3 中已删除。它们守护的不变量并没有消失，
而是改由**图结构**与**原生 recursion_limit** 保证——结构测试因此是更强的
保证方式：拓扑一旦被改动，这里立刻失败。

被守护的不变量：
1. 存在独立的 `plan_approval` 审批节点
2. 规划完成后**必经**审批（commander → plan_approval → expert_dispatcher）
3. 任务切换的回路（generic → expert_dispatcher）**不经过**审批节点，
   因此「批准后不会再次询问」由图形状保证，无需运行时位置判断
4. 不再使用静态中断（interrupt_before）——它是旧一族 workaround 的总根源
"""

import pytest

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
        assert ("plan_approval", "expert_dispatcher") in edges
        assert ("commander", "expert_dispatcher") not in edges, "规划后不得绕过审批直接分发"

    def test_task_switch_loop_bypasses_approval(self, compiled_graph):
        """批准后任务切换不得再回到审批节点——否则会变成「每个任务都问一次」。"""
        edges = _edges(compiled_graph)
        assert ("generic", "expert_dispatcher") in edges
        assert ("generic", "plan_approval") not in edges
        assert ("expert_dispatcher", "plan_approval") not in edges

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
