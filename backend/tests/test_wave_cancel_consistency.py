"""wave 执行中显式取消 → 协作取消的一致性（M4 · 取消语义回归）。

背景：`RecoveryService.cancel_run` 是**协作式**取消——只写 DB 终态（AgentRun
CANCELLED + 计划 CANCELLED + run_cancelled 账本事件 + 清理瞬态数据），不杀线程；
producer 在下一个事件检查点（`_raise_if_run_cancelled`）感知后自行退出。本测试
锁住这条链的服务级契约：

1. 第一波两个分支并行在途时取消，producer 干净退出：向外传播的**只有**
   `AppError(RUN_CANCELLED)`（这是 recovery_service 依赖的契约——由它转成
   错误事件；任何其它异常类型都意味着内部炸了）；
2. 取消是终态：run 停在 CANCELLED，不被后续路径改写成 FAILED/COMPLETED；
   计划同样 CANCELLED；账本有 run_cancelled；瞬态清理被调用；
3. 已开跑的 LLM 调用**不悬空**：每个开跑的调用要么完整落账、要么被协作取消
   干净打断（`completed ∪ aborted == started`）。这里不锁「在途调用一定跑完」
   ——放弃 astream_events 时框架可能取消在途 await，属 LangGraph 内部细节；
4. 取消后不再派生新波次：下游的「汇编」永远不会开跑；
5. 幂等：对已取消的 run 再次 cancel 返回终态提示，不抛错。

桩法与 test_wave_execution 一致：真实图（Send 扇出 / 执行子图 / interrupt 全真），
只桩 router/commander/aggregator 与专家 LLM。恢复路径直驱
`StreamService.execute_langgraph_stream`（生产上取消打断的正是它）。
"""

import asyncio
import sys
from pathlib import Path
from unittest.mock import patch

import pytest
from langchain_core.messages import AIMessage, HumanMessage
from langgraph.checkpoint.memory import MemorySaver
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from agents.plan_tasks import PlanTask  # noqa: E402
from config import settings  # noqa: E402
from models import (  # noqa: E402
    AgentRun,
    ExecutionPlan,
    RunEvent,
    RunEventType,
    RunStatus,
    RunStreamFrame,
    SystemSetting,
    TaskStatus,
    Thread,
)
from services.chat.frame_recorder import RunFrameRecorder  # noqa: E402
from services.chat.recovery_service import RecoveryService  # noqa: E402
from services.chat.stream_service import StreamService  # noqa: E402
from utils.error_codes import ErrorCode  # noqa: E402
from utils.exceptions import AppError  # noqa: E402
from utils.time import utc_now  # noqa: E402

TABLES = [
    Thread.__table__,
    AgentRun.__table__,
    ExecutionPlan.__table__,
    RunEvent.__table__,
    RunStreamFrame.__table__,
    SystemSetting.__table__,
]

# 两独立任务（第一波并行）+ 一个依赖两者的下游（取消后不得开跑）
_PLAN = [
    PlanTask(
        id="task_0",
        subtask_id="uuid-0",
        expert_type="researcher",
        description="调研甲",
        sort_order=0,
    ),
    PlanTask(
        id="task_1",
        subtask_id="uuid-1",
        expert_type="researcher",
        description="调研乙",
        sort_order=1,
    ),
    PlanTask(
        id="task_2",
        subtask_id="uuid-2",
        expert_type="writer",
        description="汇编",
        sort_order=2,
        depends_on=["task_0", "task_1"],
    ),
]

# 甲快（取消前已完成）、乙慢（取消时在途）——覆盖「已完成结果保留」与「在途被断」两种分支
_DELAYS = {"调研甲": 0.05, "调研乙": 0.8}


class _CancellableLLM:
    """假专家 LLM：按任务描述区分，记录 started / completed / aborted 三个集合。

    aborted 记录在 ainvoke 内捕获到 CancelledError 的调用——这是「协作取消把
    在途 await 干净打断」的直接证据；只记录不吞，捕获后照常 raise。
    """

    def __init__(self, delay_by_label: dict[str, float]):
        self._delays = delay_by_label
        self.started: list[str] = []
        self.completed: list[str] = []
        self.aborted: list[str] = []

    @staticmethod
    def _label(messages) -> str:
        prompt = "\n".join(str(getattr(m, "content", "")) for m in messages)
        for line in prompt.splitlines():
            if line.startswith("任务描述: "):
                return line.removeprefix("任务描述: ").strip()
        return "unknown"

    def bind(self, **_kwargs):
        return self

    def bind_tools(self, _tools):
        return self

    async def ainvoke(self, messages, config=None):
        label = self._label(messages)
        self.started.append(label)
        try:
            await asyncio.sleep(self._delays.get(label, 0.05))
        except asyncio.CancelledError:
            self.aborted.append(label)
            raise
        self.completed.append(label)
        return AIMessage(content=f"{label} 的产出")


@pytest.fixture
def engine():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine, tables=TABLES)
    with Session(engine) as session:
        session.add(Thread(id="t1", title="会话", user_id="u1"))
        session.add(
            AgentRun(
                id="r1",
                thread_id="t1",
                user_id="u1",
                status=RunStatus.WAITING_FOR_APPROVAL,  # 已停在审批点，等待恢复
                created_at=utc_now(),
                started_at=utc_now(),
                updated_at=utc_now(),
                deadline_at=None,  # HITL 等待期已挂起预算（恢复时会重置）
            )
        )
        session.add(
            ExecutionPlan(
                id="p1", thread_id="t1", user_query="做个页面", run_id="r1", plan_version=1
            )
        )
        session.add(SystemSetting(key="graph_max_concurrency", value="2"))
        session.commit()
    yield engine
    engine.dispose()


async def _park_at_approval(saver: MemorySaver) -> None:
    """用真实图把状态停到审批点（与 test_wave_execution 同款桩法）。"""
    from agents.graph_builder import create_smart_router_workflow

    async def _fake_router(state, config=None):
        return {"router_decision": "complex", "router_reason": "test"}

    async def _fake_commander(state, config=None):
        return {
            "task_list": [task.to_state_dict() for task in _PLAN],
            "strategy": "测试策略",
            "execution_plan_id": "p1",
        }

    with (
        patch("agents.nodes.router_node", _fake_router),
        patch("agents.nodes.commander_node", _fake_commander),
    ):
        graph = create_smart_router_workflow(checkpointer=saver)
        config = {
            "recursion_limit": 100,
            "configurable": {"thread_id": "t1_r1", "graph_max_concurrency": 2},
        }
        await graph.ainvoke(
            {"messages": [HumanMessage(content="请做个计划")], "thread_id": "t1_r1"}, config
        )
        state = await graph.aget_state(config)
        pending = [intr for task in (state.tasks or ()) for intr in (task.interrupts or ())]
        assert pending, "测试前置失败：图没有停在审批 interrupt 上"


async def _wait_until(predicate, *, timeout: float, what: str) -> None:
    loop = asyncio.get_running_loop()
    deadline = loop.time() + timeout
    while loop.time() < deadline:
        if predicate():
            return
        await asyncio.sleep(0.01)
    raise AssertionError(f"超时：{what}")


@pytest.mark.asyncio
async def test_cancel_mid_wave_is_cooperative_and_consistent(monkeypatch, engine):
    monkeypatch.setattr(settings, "stream_timeout", 0.05)
    saver = MemorySaver()
    await _park_at_approval(saver)

    llm = _CancellableLLM(_DELAYS)
    svc = StreamService(Session(engine))

    async def _fake_mcp_tools() -> list:
        return []

    monkeypatch.setattr(svc, "_get_mcp_tools", _fake_mcp_tools)

    cleanup_calls: list[tuple] = []

    async def _fake_cleanup(thread_id, run_ids):
        cleanup_calls.append((thread_id, list(run_ids)))

    monkeypatch.setattr("utils.db.cleanup_terminal_run", _fake_cleanup)

    async def _noop_async(*_args, **_kwargs) -> None:
        return None

    # async_task_queue 的三支后台落库（结果/任务开始/账本）都开新 session 连
    # database.engine（PG）——测试环境必须全部桩掉，否则连接超时重试拖死收尾
    monkeypatch.setattr("utils.async_task_queue.async_save_expert_result", _noop_async)
    monkeypatch.setattr("utils.async_task_queue.async_mark_subtask_running", _noop_async)
    monkeypatch.setattr("utils.async_task_queue.async_append_run_event", _noop_async)

    async def _passthrough_node(state, config=None):
        return {}

    # 帧记录器必须换成本测试的 SQLite 引擎：全局 recorder 默认绑 database.engine（PG），
    # 测试进程里那是一次必然失败的连接 + 2s 退避重试，会拖死 executor 收尾
    recorder = RunFrameRecorder(session_factory=lambda: Session(engine), flush_interval=5)

    with (
        # 执行期不经过 router/commander（已在审批点之后），但建图会绑定它们，一并桩掉
        # （必须是 async：aggregator 带 timeout 注册，langgraph 拒绝 sync 节点）
        patch("agents.nodes.router_node", _passthrough_node),
        patch("agents.nodes.aggregator_node", _passthrough_node),
        patch("utils.db.get_shared_checkpointer", lambda: saver),
        patch("services.chat.stream_service.get_frame_recorder", lambda: recorder),
        patch("agents.nodes.generic.get_expert_llm", lambda **_kw: llm),
        patch(
            "agents.nodes.generic.get_expert_config_cached",
            lambda _t: {"name": "E", "system_prompt": "{input}"},
        ),
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
    ):
        agen = svc.execute_langgraph_stream(
            thread_id="t1",
            stream_queue=asyncio.Queue(),
            sse_queue=asyncio.Queue(),
            realtime_queue=asyncio.Queue(),
            message_id="m1",
            run_id="r1",
        )

        events: list[str] = []
        errors: list[BaseException] = []

        async def _consume():
            try:
                async for event in agen:
                    events.append(event)
            except BaseException as exc:  # AppError(RUN_CANCELLED) 是契约内的上抛
                errors.append(exc)

        consumer = asyncio.create_task(_consume())

        # 等第一波两个分支都开跑、且快的那个已完成——此刻取消落在「半完成」窗口
        await _wait_until(
            lambda: len(llm.started) >= 2 and "调研甲" in llm.completed,
            timeout=5,
            what="第一波两个分支开跑且 调研甲 完成",
        )

        recovery = RecoveryService(Session(engine))
        result = await recovery.cancel_run("r1", "u1")
        assert result["status"] == "cancelled"

        await asyncio.wait_for(consumer, timeout=10)

    # ① producer 的退出方式：只允许 RUN_CANCELLED 的 AppError（recovery 靠它转错误事件）。
    # 注意它可能来自 producer 的 token 检查点，也可能来自消费者自己的心跳检查——
    # 两种先后顺序生产上都合法（消费者的生成器先死，producer 照样后台收尾）。
    assert len(errors) == 1, f"应恰好一次契约内上抛，实际 {errors!r}"
    assert isinstance(errors[0], AppError) and errors[0].code == ErrorCode.RUN_CANCELLED

    # 执行期事件进入了持久帧（取消前已发出的内容可被 resume 补放，seq 从 1 连续）。
    # 轮询等待：若消费者先抛，producer 要再走几步才在 finally 里同步刷帧。
    from crud.run_stream_frame import list_frames_after

    loop = asyncio.get_running_loop()
    deadline = loop.time() + 5
    frame_seqs: list[int] = []
    while loop.time() < deadline:
        with Session(engine) as db:
            frame_seqs = sorted(frame.seq for frame in list_frames_after(db, "r1", 0))
        if frame_seqs:
            break
        await asyncio.sleep(0.02)
    assert frame_seqs == list(range(1, len(frame_seqs) + 1)) and frame_seqs, (
        f"执行期事件应连续落帧，实际 {frame_seqs}；消费到 {len(events)} 帧"
    )

    # ② 在途调用不悬空：等所有已开跑的调用都有明确终局（完成或被协作取消打断）
    await _wait_until(
        lambda: set(llm.started) <= set(llm.completed) | set(llm.aborted),
        timeout=3,
        what="全部已开跑调用落账（completed ∪ aborted）",
    )
    assert set(llm.started) == set(llm.completed) | set(llm.aborted)

    # ③ 取消后不再派生新波次
    assert "汇编" not in llm.started, "取消后下游任务不得再开跑"

    # ④ DB 终态与账本
    with Session(engine) as db:
        run = db.get(AgentRun, "r1")
        assert run.status == RunStatus.CANCELLED, f"取消必须是终态，实际 {run.status}"
        plan = db.exec(select(ExecutionPlan).where(ExecutionPlan.run_id == "r1")).one()
        assert plan.status == TaskStatus.CANCELLED
        event_types = {
            row.event_type for row in db.exec(select(RunEvent).where(RunEvent.run_id == "r1")).all()
        }
        assert RunEventType.RUN_CANCELLED in event_types

    assert cleanup_calls == [("t1", ["r1"])], "取消应清理本 run 的瞬态数据"

    # ⑤ 图状态仍可读、计划未被半写破坏（aget_state 是断连后排查/审计的入口）
    from agents.graph_builder import create_smart_router_workflow

    graph = create_smart_router_workflow(checkpointer=saver)
    state = await graph.aget_state({"configurable": {"thread_id": "t1_r1"}})
    assert len(state.values.get("task_list", [])) == 3, "计划数据在取消后应保持完整"

    # ⑥ 幂等：对已终态的 run 再取消，返回提示而不抛错
    second = await RecoveryService(Session(engine)).cancel_run("r1", "u1")
    assert second["status"] == str(RunStatus.CANCELLED)
