"""规划阶段客户端断连 ≠ 杀死 producer（M4 · 断连语义回归）。

回归背景：producer/consumer 分离改造之前，图执行跑在 SSE 生成器里，客户端一断连
（例如刷新页面）Starlette 就取消生成器 → **规划阶段的 run 当场死亡**。改造后
断连只结束传输（消费端收到 CancelledError 自尽，现为 stream_pipeline 的
events 生成器），producer 在后台继续跑到审批点，`human.interrupt` 帧落库，
重连时由 resume 端点补放。

本测试用真实图（interrupt / checkpointer / HITL 检测全真，只把 router/commander
换成桩，桩法与 test_wave_execution 一致）直驱 `handle_langgraph_stream`，锁住
完整链条：

1. 断连落在规划途中：commander 桩睡 0.4s，往生成器 throw CancelledError
   （= Starlette 取消流任务的等价物）时它还没醒；
2. producer 存活：run 走到 WAITING_FOR_APPROVAL（不是 FAILED / 僵尸 RUNNING），
   且 deadline 被挂起（HITL 等待期不消耗预算）；
3. hitl_interrupted 账本事件已写；
4. human.interrupt 帧已持久化（finish_blocking 在 producer 的 finally 里同步
   刷库——所以「帧出现在库里」是 producer 完整收尾的最后一条证据）；
5. 图真实停在 interrupt 上：aget_state 能看到 pending interrupts —— 这是
   /chat/resume 能续跑的数据前提。

为什么第一帧断言是心跳：桩节点不产生任何内容事件（transform_langgraph_event
只放行 aggregator/direct_reply 的 token 流），把 stream_timeout 调小后，规划
静默期客户端收到的就是心跳——正好是「连接活着、内容还没来」的真实形态。
"""

import asyncio
import sys
from datetime import timedelta
from pathlib import Path
from unittest.mock import patch

import pytest
from langchain_core.messages import HumanMessage
from langgraph.checkpoint.memory import MemorySaver
from sqlmodel import Session, SQLModel, create_engine, select

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from agents.plan_tasks import PlanTask  # noqa: E402
from config import settings  # noqa: E402
from crud.run_stream_frame import list_frames_after  # noqa: E402
from models import (  # noqa: E402
    AgentRun,
    ExecutionPlan,
    RunEvent,
    RunEventType,
    RunStatus,
    RunStreamFrame,
    SystemSetting,
    Thread,
)
from services.chat.frame_recorder import RunFrameRecorder  # noqa: E402
from services.chat.stream_service import StreamService  # noqa: E402
from utils.time import utc_now_naive  # noqa: E402

# handle_langgraph_stream 会碰到的全部表（含只读的 SystemSetting——
# resolve_graph_max_concurrency 对它做 session.get，表缺了会直接抛）。
TABLES = [
    Thread.__table__,
    AgentRun.__table__,
    ExecutionPlan.__table__,
    RunEvent.__table__,
    RunStreamFrame.__table__,
    SystemSetting.__table__,
]

_COMMANDER_DELAY = 0.4

_PLAN = [
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
    ),
]


@pytest.fixture
def engine(tmp_path):
    # 用**临时文件库 + 默认池**而非 StaticPool 单连接：本测试的 producer
    # （后台任务 / to_thread）与测试轮询分属多个 session，StaticPool 的
    # 单连接会让跨 session 的事务可见性与回滚相互污染——这正是本测试
    # 偶发挂的土壤（CI/本地都随机复现过）。文件库提供真实的连接级
    # 事务隔离，贴近生产（PG 多连接）形态。
    engine = create_engine(
        f"sqlite:///{tmp_path}/producer-test.db",
        connect_args={"check_same_thread": False},
    )
    SQLModel.metadata.create_all(engine, tables=TABLES)
    with Session(engine) as session:
        session.add(Thread(id="t1", title="会话", user_id="u1"))
        session.add(
            AgentRun(
                id="r1",
                thread_id="t1",
                user_id="u1",
                status=RunStatus.QUEUED,
                created_at=utc_now_naive(),
                started_at=utc_now_naive(),
                updated_at=utc_now_naive(),
                deadline_at=utc_now_naive() + timedelta(seconds=600),
            )
        )
        session.add(
            ExecutionPlan(
                id="p1", thread_id="t1", user_query="做个页面", run_id="r1", plan_version=1
            )
        )
        session.commit()
    yield engine
    engine.dispose()


def _db(engine) -> Session:
    return Session(engine)


async def _wait_for_frame(engine, needle: str, timeout: float = 5.0) -> list[RunStreamFrame]:
    """轮询持久帧直到出现指定内容（producer 收尾的最后一步是同步刷帧）。"""
    loop = asyncio.get_running_loop()
    deadline = loop.time() + timeout
    frames: list[RunStreamFrame] = []
    while loop.time() < deadline:
        with _db(engine) as db:
            frames = list_frames_after(db, "r1", 0)
        if any(needle in frame.wire for frame in frames):
            return frames
        await asyncio.sleep(0.02)
    raise AssertionError(f"超时未等到帧内容 {needle!r}，已落库 {len(frames)} 帧")


@pytest.mark.asyncio
async def test_disconnect_during_planning_keeps_producer_alive(monkeypatch, engine):
    monkeypatch.setattr(settings, "stream_timeout", 0.05)  # 心跳加速：断连不必等 120s
    saver = MemorySaver()
    recorder = RunFrameRecorder(session_factory=lambda: Session(engine), flush_interval=5)

    async def _fake_router(state, config=None):
        return {"router_decision": "complex", "router_reason": "test"}

    async def _fake_commander(state, config=None):
        # 拉长规划期：断连必须落在它醒来之前，否则测不到「producer 比消费者活得久」
        await asyncio.sleep(_COMMANDER_DELAY)
        return {
            "task_list": [task.to_state_dict() for task in _PLAN],
            "strategy": "测试策略",
            "execution_plan_id": "p1",
        }

    svc = StreamService(Session(engine))

    async def _fake_mcp_tools() -> list:
        return []

    monkeypatch.setattr(svc, "_get_mcp_tools", _fake_mcp_tools)

    # 内存对象只取标识：handle_langgraph_stream 对它们的全部使用就是 id/thread_id
    agent_run = AgentRun(id="r1", thread_id="t1", user_id="u1")
    thread = Thread(id="t1", title="会话", user_id="u1")

    with (
        patch("agents.nodes.router_node", _fake_router),
        patch("agents.nodes.commander_node", _fake_commander),
        patch("utils.db.get_shared_checkpointer", lambda: saver),
        patch("services.chat.stream_service.get_frame_recorder", lambda: recorder),
    ):
        resp = await svc.handle_langgraph_stream(
            initial_state={"messages": [HumanMessage(content="请做个计划")], "thread_id": "t1"},
            thread_id="t1",
            thread=thread,
            agent_run=agent_run,
            user_message="请做个计划",
        )
        gen = resp.body_iterator

        # ① 连接活着：规划静默期收到的是心跳（commander 此刻还在睡）
        first = await asyncio.wait_for(gen.__anext__(), timeout=5)
        assert "heartbeat" in first, f"静默期第一帧应是心跳，实际 {first!r}"
        assert "human.interrupt" not in first, "断连前审批卡不应已发出"

        # ② 断连：Starlette 取消流任务时往生成器注入的就是 CancelledError
        with pytest.raises(asyncio.CancelledError):
            await gen.athrow(asyncio.CancelledError)

    # ③ producer 在后台继续：审批卡最终出现在持久帧里（收尾 = 帧已同步刷库）
    frames = await _wait_for_frame(engine, "human.interrupt")
    seqs = sorted(frame.seq for frame in frames)
    assert seqs == list(range(1, len(seqs) + 1)), "帧 seq 应从 1 连续编号（重放不缺口）"

    # ④ run 终态与账本
    with _db(engine) as db:
        run = db.get(AgentRun, "r1")
        assert run.status == RunStatus.WAITING_FOR_APPROVAL, (
            f"producer 应把 run 停在审批点，实际 {run.status}"
        )
        assert run.deadline_at is None, "HITL 等待期应挂起执行预算"
        event_types = {
            row.event_type for row in db.exec(select(RunEvent).where(RunEvent.run_id == "r1")).all()
        }
        assert RunEventType.HITL_INTERRUPTED in event_types, "缺 hitl_interrupted 账本事件"
        assert RunEventType.ROUTER_DECIDED in event_types, "断连前已发生的事件不得丢账本"

    # ⑤ 图真实停在 interrupt 上——这是 /chat/resume 能续跑的数据前提
    from agents.graph_builder import create_smart_router_workflow

    graph = create_smart_router_workflow(checkpointer=saver)
    state = await graph.aget_state({"configurable": {"thread_id": "t1_r1"}})
    pending = [intr for task in (state.tasks or ()) for intr in (task.interrupts or ())]
    assert pending, "图没有真实停在 interrupt 上，断连后 /chat/resume 将无法续跑"
    assert state.values.get("task_list"), "计划未写入图状态，审批页将无内容可渲染"
