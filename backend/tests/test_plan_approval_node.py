"""`plan_approval` 节点的行为测试（批次 B3）。

用真节点 + 最小图跑一次「暂停 → 恢复」，锁住三条关键语义：
1. 计划为空时不打扰用户（直接放行）
2. 有计划时图**停在**该节点（`snapshot.tasks[].interrupts` 非空，原生判据）
3. 恢复时节点从头重跑、`interrupt()` 返回裁决值，且**上游节点不重跑**
   （这是「决定 3 非 B3 阻塞项」的依据，也是本节点代码顺序约束的来源）
"""

import asyncio
import operator
from typing import Annotated, TypedDict

import pytest
from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, StateGraph
from langgraph.types import Command

from agents.nodes.plan_approval import plan_approval_node


class _S(TypedDict, total=False):
    task_list: list[dict]
    approval_action: str | None
    trace: Annotated[list[str], operator.add]


@pytest.fixture
def make_graph():
    """构造 plan_before → plan_approval → after 的最小图。"""

    def _build(*, tasks: list[dict]):
        async def plan_before(state: _S, config: RunnableConfig = None):
            return {"task_list": tasks, "trace": ["plan_before"]}

        async def after(state: _S, config: RunnableConfig = None):
            return {"trace": ["after"]}

        g = StateGraph(_S)
        g.add_node("plan_before", plan_before)
        g.add_node("plan_approval", plan_approval_node)
        g.add_node("after", after)
        g.set_entry_point("plan_before")
        g.add_edge("plan_before", "plan_approval")
        g.add_edge("plan_approval", "after")
        g.add_edge("after", END)
        return g.compile(checkpointer=MemorySaver())

    return _build


def _run_until_pause(app, thread: str) -> dict:
    async def _go():
        cfg = {"configurable": {"thread_id": thread}}
        await app.ainvoke({"trace": []}, config=cfg)
        return await app.aget_state(cfg)

    return asyncio.run(_go())


def _resume(app, thread: str, decision: dict) -> dict:
    async def _go():
        cfg = {"configurable": {"thread_id": thread}}
        return await app.ainvoke(Command(resume=decision), config=cfg)

    return asyncio.run(_go())


class TestEmptyPlanSkipsApproval:
    def test_no_tasks_passes_through_without_interrupt(self, make_graph):
        app = make_graph(tasks=[])

        state = _run_until_pause(app, "t-empty")

        assert not [i for t in (state.tasks or ()) for i in (t.interrupts or ())]
        assert state.values["trace"] == ["plan_before", "after"]


class TestPausesAndResumes:
    def test_pauses_at_approval(self, make_graph):
        app = make_graph(tasks=[{"id": "task_1", "expert_type": "researcher"}])

        state = _run_until_pause(app, "t-pause")

        interrupts = [i for t in (state.tasks or ()) for i in (t.interrupts or ())]
        assert interrupts, "有计划时必须停在审批节点"
        assert interrupts[0].value.get("type") == "plan_approval"
        assert "after" not in state.values["trace"], "未裁决前不得进入下游节点"

    def test_resume_with_approve_continues(self, make_graph):
        app = make_graph(tasks=[{"id": "task_1", "expert_type": "researcher"}])
        _run_until_pause(app, "t-approve")

        final = _resume(app, "t-approve", {"action": "approve"})

        assert final["trace"] == ["plan_before", "after"], (
            "上游 plan_before 不得重跑（恢复只重跑含中断的节点）"
        )
        assert final["approval_action"] == "approve"

    def test_resume_without_dict_decision_defaults_to_approve(self, make_graph):
        """裁决值不是 dict（如字符串）时按 approve 兜底。

        注：resume 值**不可为 None**——langgraph 1.2.11 在以 None 恢复时会在
        内部抛 `UnboundLocalError: resume_is_map`（框架层面问题，非本节点可控）。
        因此服务层一律传 `{"action": ...}` 字典。
        """
        app = make_graph(tasks=[{"id": "task_1", "expert_type": "researcher"}])
        _run_until_pause(app, "t-nodict")

        final = _resume(app, "t-nodict", "approve")

        assert final["approval_action"] == "approve"
