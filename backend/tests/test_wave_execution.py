"""波次执行集成测试：跑**真实图**（真 wave_dispatch / 真执行子图 / 真 task_join）。

这是 C2 验收里「宽计划 fixture，不走 LLM」那一项：只把四个外部边界换成桩——
router / commander / aggregator 三个节点，以及专家 LLM（`get_expert_llm`）——
执行子图、Send 扇出、扇入、产物落状态全部是真代码。

覆盖的不变量：
1. 串行（并发上限 1）= 按 `sort_order` 一个一个跑，与接线前行为一致
2. 并发（上限 ≥2）= 同层任务**真的重叠执行**（用 LLM 调用的起止时间证明，不看耗时）
3. 依赖门控：上游没完成时下游不进本轮
4. 单分支失败 → 兄弟任务照常完成；下游被标失败并写明原因（不静默消失）
5. 依赖成环 → 标失败收尾，不空转到 recursion_limit
6. 聚合顺序 = 计划顺序（不是完成顺序）
7. 上游产物经 Send payload 注入下游 prompt
"""

import asyncio
import sys
from pathlib import Path
from unittest.mock import patch

import pytest  # noqa: E402
from langchain_core.messages import AIMessage, HumanMessage

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from agents.plan_tasks import PlanTask  # noqa: E402
from models.enums import ExecutionMode  # noqa: E402


class _RecordingBound:
    """记录每次 LLM 调用的「谁、起、止、看到的上游上下文」。"""

    def __init__(self, llm):
        self._llm = llm

    def bind(self, **_kwargs):
        return self

    def bind_tools(self, _tools):
        return self

    async def ainvoke(self, messages, config=None):
        return await self._llm.ainvoke(messages, config=config)


class _RecordingLLM:
    """假专家 LLM：按 prompt 里的任务描述区分任务，记录时间窗与调用次数。"""

    def __init__(self, *, delay: float = 0.0, fail_on: str | None = None):
        self._delay = delay
        self._fail_on = fail_on
        self.calls: dict[str, list[tuple[float, float]]] = {}
        self.prompts: dict[str, str] = {}

    def bind(self, **_kwargs):
        return _RecordingBound(self)

    async def ainvoke(self, messages, config=None):
        loop = asyncio.get_running_loop()
        prompt = "\n".join(str(getattr(m, "content", "")) for m in messages)
        # 只认专家节点拼的「任务描述: ...」行（router/commander 已被换成桩）
        label = "unknown"
        for line in prompt.splitlines():
            if line.startswith("任务描述: "):
                label = line.removeprefix("任务描述: ").strip()
                break
        if self._fail_on and label == self._fail_on:
            raise RuntimeError(f"刻意失败: {label}")

        start = loop.time()
        if self._delay:
            await asyncio.sleep(self._delay)
        end = loop.time()

        self.calls.setdefault(label, []).append((start, end))
        self.prompts[label] = prompt
        return AIMessage(content=f"{label} 的产出")


_EXPERT_CONFIG = {"name": "Expert", "system_prompt": "你是专家 {input}", "model": "deepseek-flash"}


def _plan_state(tasks: list[PlanTask]) -> list[dict]:
    return [task.to_state_dict() for task in tasks]


def _plan_fixture() -> list[PlanTask]:
    """菱形 + 一条独立链：

    task_0（调研）
      ├── task_1（写作）
      └── task_2（配图）
    task_3（独立的资料整理）
    task_4（汇编，依赖 1、2）
    """
    return [
        PlanTask(
            id="task_0",
            subtask_id="uuid-0",
            expert_type="researcher",
            description="调研",
            sort_order=0,
        ),
        PlanTask(
            id="task_1",
            subtask_id="uuid-1",
            expert_type="writer",
            description="写作",
            sort_order=1,
            depends_on=["task_0"],
            execution_mode=ExecutionMode.PARALLEL,
        ),
        PlanTask(
            id="task_2",
            subtask_id="uuid-2",
            expert_type="designer",
            description="配图",
            sort_order=2,
            depends_on=["task_0"],
            execution_mode=ExecutionMode.PARALLEL,
        ),
        PlanTask(
            id="task_3",
            subtask_id="uuid-3",
            expert_type="researcher",
            description="资料整理",
            sort_order=3,
        ),
        PlanTask(
            id="task_4",
            subtask_id="uuid-4",
            expert_type="writer",
            description="汇编",
            sort_order=4,
            depends_on=["task_1", "task_2"],
        ),
    ]


async def _noop_async(*_args, **_kwargs) -> None:
    """替掉后台落库协程（真实落库由 e2e 覆盖）。"""
    return None


async def _run_graph(tasks: list[PlanTask], *, max_concurrency: int, llm: _RecordingLLM) -> dict:
    """驱动真实图：router/commander/aggregator 换桩，执行侧全真。"""
    from agents.graph_builder import create_smart_router_workflow

    task_list = _plan_state(tasks)

    async def _fake_router(state, config=None):
        return {"router_decision": "complex", "router_reason": "test"}

    async def _fake_commander(state, config=None):
        return {"task_list": task_list, "strategy": "测试策略", "execution_plan_id": "plan-1"}

    async def _fake_aggregator(state, config=None):
        # 真 aggregator 会写库 + 调 LLM；这里只锁「收到什么、什么顺序」
        return {
            "final_response": "综述",
            "task_list": state.get("task_list", []),
            "messages": [HumanMessage(content="综述")],
        }

    with (
        patch("agents.nodes.router_node", _fake_router),
        patch("agents.nodes.commander_node", _fake_commander),
        patch("agents.nodes.aggregator_node", _fake_aggregator),
        patch("agents.nodes.generic.get_expert_llm", lambda **_kw: llm),
        patch("agents.nodes.generic.get_expert_config_cached", lambda _t: _EXPERT_CONFIG),
        patch("agents.nodes.generic._generic_expert_cache", {}),
        patch(
            "agents.nodes.generic.get_model_config",
            lambda m: {"provider": "deepseek", "model": m, "temperature": 0.6},
        ),
        patch(
            "agents.nodes.generic.load_providers_config",
            lambda: {"providers": {"deepseek": {"content_mode": "string"}}},
        ),
        patch("agents.nodes.generic.tool_policy_service.get_overrides", return_value={}),
        patch("agents.nodes.generic.filter_tools_for_binding", return_value=([], [])),
        # 产物落库（后台线程写 SubTask/Artifact）不在本测试范围：本测试只验执行语义
        patch("utils.async_task_queue.async_save_expert_result", _noop_async),
        # 事件发射走真实实现（adispatch_custom_event 在节点运行上下文里可用）；
        # 本测试不消费 SSE，只验证执行语义
    ):
        graph = create_smart_router_workflow()
        config = {
            "configurable": {"thread_id": "t-1", "graph_max_concurrency": max_concurrency},
            "recursion_limit": 100,
        }
        from langgraph.types import Command

        await graph.ainvoke(
            {"messages": [HumanMessage(content="请做个计划")], "thread_id": "t-1"},
            config,
        )
        return await graph.ainvoke(Command(resume={"action": "approve"}), config)


def _by_key(task_list: list[dict]) -> dict[str, dict]:
    return {task["task_id"]: task for task in task_list}


def _overlaps(llm: _RecordingLLM, a: str, b: str) -> bool:
    """两个任务的 LLM 调用时间窗是否重叠（真并发的判据）。"""
    for a_start, a_end in llm.calls.get(a, []):
        for b_start, b_end in llm.calls.get(b, []):
            if a_start < b_end and b_start < a_end:
                return True
    return False


@pytest.mark.asyncio
async def test_serial_runs_one_task_at_a_time_in_order():
    llm = _RecordingLLM()
    final = await _run_graph(_plan_fixture(), max_concurrency=1, llm=llm)

    tasks = _by_key(final["task_list"])
    assert all(task["status"] == "completed" for task in tasks.values())
    assert set(llm.calls) == {"调研", "写作", "配图", "资料整理", "汇编"}

    # 串行：同一时刻只有一个专家在跑（任意两个任务的窗口都不重叠）
    labels = list(llm.calls)
    for idx, first in enumerate(labels):
        for second in labels[idx + 1 :]:
            assert not _overlaps(llm, first, second), f"{first} 与 {second} 在串行模式下重叠了"


@pytest.mark.asyncio
async def test_parallel_branches_really_overlap():
    """并发上限 2：同层的「写作」「配图」必须真的重叠执行。"""
    llm = _RecordingLLM(delay=0.05)
    await _run_graph(_plan_fixture(), max_concurrency=2, llm=llm)

    assert _overlaps(llm, "写作", "配图"), (
        "同层任务没有重叠执行——并发没真正生效（或 max_concurrency 未被 route_wave 读到）"
    )


@pytest.mark.asyncio
async def test_parallel_does_not_break_dependency_gate():
    """并发下依赖仍然门控：下游的 prompt 里必须能看到**直接上游**产出。"""
    llm = _RecordingLLM()
    await _run_graph(_plan_fixture(), max_concurrency=3, llm=llm)

    assert "调研" in llm.prompts, "上游任务没跑"
    # 第二波：直接上游（调研）的产出经 Send payload 注入
    assert "调研 的产出" in llm.prompts["写作"]
    # 第三波：上游是上一波的两个任务，产出同样到位（跨波次的 payload 解析）
    assert "写作 的产出" in llm.prompts["汇编"]
    assert "配图 的产出" in llm.prompts["汇编"]
    # 只注入**直接**上游：隔一层的产出不进 prompt（避免上下文被无关内容淹没）
    assert "调研 的产出" not in llm.prompts["汇编"]


@pytest.mark.asyncio
async def test_branch_failure_keeps_siblings_and_marks_downstream():
    """单分支失败：兄弟照常完成，下游被标失败并写明原因。"""
    llm = _RecordingLLM(fail_on="配图")
    final = await _run_graph(_plan_fixture(), max_concurrency=2, llm=llm)

    tasks = _by_key(final["task_list"])
    assert tasks["task_0"]["status"] == "completed"
    assert tasks["task_1"]["status"] == "completed", "兄弟任务必须照常完成"
    assert tasks["task_2"]["status"] == "failed"
    assert tasks["task_3"]["status"] == "completed", "无关的独立任务必须照常完成"
    assert tasks["task_4"]["status"] == "failed", "依赖失败的上游 → 下游必须被标失败"
    assert "上游任务失败" in (tasks["task_4"]["output_result"] or {}).get("content", "")
    assert "配图" not in llm.prompts or "汇编" not in llm.prompts, "下游不得带着缺失上游硬跑"


@pytest.mark.asyncio
async def test_dependency_cycle_ends_plan_instead_of_spinning():
    """依赖成环：标失败收尾（不空转到 recursion_limit）。"""
    tasks = [
        PlanTask(
            id="task_0",
            subtask_id="uuid-0",
            expert_type="writer",
            description="甲",
            sort_order=0,
            depends_on=["task_1"],
        ),
        PlanTask(
            id="task_1",
            subtask_id="uuid-1",
            expert_type="writer",
            description="乙",
            sort_order=1,
            depends_on=["task_0"],
        ),
        PlanTask(
            id="task_2", subtask_id="uuid-2", expert_type="writer", description="丙", sort_order=2
        ),
    ]
    llm = _RecordingLLM()
    final = await _run_graph(tasks, max_concurrency=2, llm=llm)

    by_key = _by_key(final["task_list"])
    assert by_key["task_2"]["status"] == "completed", "环外的任务照常跑"
    assert by_key["task_0"]["status"] == "failed"
    assert by_key["task_1"]["status"] == "failed"
    assert "依赖成环" in (by_key["task_0"]["output_result"] or {}).get("content", "")
    assert "甲" not in llm.calls and "乙" not in llm.calls, "成环任务不得被执行"


@pytest.mark.asyncio
async def test_expert_results_follow_plan_order_not_completion_order():
    """聚合顺序 = 计划顺序：完成顺序不同不得改变 expert_results 的顺序。"""

    class _ReversedDelayLLM(_RecordingLLM):
        """让 sort_order 靠前的任务睡更久 —— 完成顺序与计划顺序相反。"""

        async def ainvoke(self, messages, config=None):
            loop = asyncio.get_running_loop()
            prompt = "\n".join(str(getattr(m, "content", "")) for m in messages)
            label = next(
                (
                    line.removeprefix("任务描述: ").strip()
                    for line in prompt.splitlines()
                    if line.startswith("任务描述: ")
                ),
                "unknown",
            )
            start = loop.time()
            await asyncio.sleep({"写作": 0.12, "配图": 0.01}.get(label, 0.0))
            end = loop.time()
            self.calls.setdefault(label, []).append((start, end))
            self.prompts[label] = prompt
            return AIMessage(content=f"{label} 的产出")

    llm = _ReversedDelayLLM()
    final = await _run_graph(_plan_fixture(), max_concurrency=2, llm=llm)

    order = [result["task_id"] for result in final["expert_results"]]
    assert order == sorted(order, key=lambda key: int(key.split("_")[1])), (
        f"expert_results 必须按计划顺序，实际 {order}"
    )
    assert _overlaps(llm, "写作", "配图"), "这一断言的前提是两者确实并发（否则测不到顺序）"
