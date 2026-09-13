"""「一轮一个写入者」——复杂模式不由 stream_service 重复保存助手消息。

背景（双写）：复杂模式的助手消息由 **aggregator 节点**写入
（`save_assistant_message_sync`，带 `state.message_id`），它是图内最后一个节点
且无条件写入。而 `_save_langgraph_result` 末尾也保存一条助手消息，内容取自
`state["messages"][-1]`——复杂模式下那是**最后一个专家的原始产出**，不是用户
看到的聚合综述。这条路径平时走不到（前端恒走流式 + 审批暂停），但
`handle_langgraph_sync`（公开 sync API）会走到，属真实可触发的重复写入，
后果是同一轮出现两条内容不同的助手消息。

同一处还把 `execution_plan.final_response` 覆盖成 `last_message.content`
（专家原始产出），把 aggregator 写入的综述冲掉——已改为仅在为空时兜底。

本文件锁住这两条：复杂模式不写助手消息；计划正文不被非综述内容覆盖。
用真实内存 SQLite 会话（与既有测试同惯例）——复杂分支会真的读写 ExecutionPlan，
用假会话反而要照抄 ORM 接口。
"""

import asyncio
from types import SimpleNamespace

import pytest
from langchain_core.messages import AIMessage
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from models import ExecutionPlan, SubTask, Thread
from services.chat.stream_service import StreamService

TABLES = [Thread.__table__, ExecutionPlan.__table__, SubTask.__table__]


class _FakeThreadService:
    """只实现被测路径用到的两个协程；在这里它是**被观察者**。"""

    def __init__(self):
        self.saved_messages: list[dict] = []

    async def update_thread_agent_type(self, _thread_id, _agent_type):
        return None

    async def save_assistant_message(self, **kwargs):
        self.saved_messages.append(kwargs)
        return SimpleNamespace(id=1)


@pytest.fixture
def db():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine, tables=TABLES)
    with Session(engine) as session:
        session.add(Thread(id="t1", title="会话", user_id="u1"))
        session.add(
            ExecutionPlan(id="p1", thread_id="t1", user_query="q", run_id="r1", plan_version=1)
        )
        session.commit()
        yield session


class _ServiceUnderTest(StreamService):
    """覆盖只读的 thread_service property（真实实现是懒加载实例，不可赋值）。"""

    def __init__(self, db: Session, thread_service: _FakeThreadService):
        self.db = db
        self._thread_service = thread_service

    @property
    def thread_service(self):
        return self._thread_service


def _service(db: Session) -> _ServiceUnderTest:
    return _ServiceUnderTest(db, _FakeThreadService())


def _run(db: Session, *, decision: str, summary: str | None) -> _ServiceUnderTest:
    """跑一次保存；summary 非 None 时先写入计划正文（模拟 aggregator 已落库）。"""
    if summary is not None:
        plan = db.get(ExecutionPlan, "p1")
        plan.final_response = summary
        db.add(plan)
        db.commit()

    svc = _service(db)
    asyncio.run(
        svc._save_langgraph_result(
            thread_id="t1",
            thread=db.get(Thread, "t1"),
            user_message="问题",
            last_message=AIMessage(content="state 里的最后一条消息"),
            router_decision=decision,
            task_list=[],
            expert_artifacts={},
            message_id="m1",
            run_id="r1",
        )
    )
    return svc


class TestComplexModeHasSingleWriter:
    def test_complex_does_not_save_assistant_message(self, db):
        """核心回归：复杂模式不得由 stream_service 再写一条助手消息。"""
        svc = _run(db, decision="complex", summary="聚合综述")

        assert svc.thread_service.saved_messages == [], "聚合综述由 aggregator 写入，此处不得重复"

    def test_simple_mode_still_saves_assistant_message(self, db):
        """简单模式没有 aggregator 参与，仍由这里保存（唯一写入者）。"""
        svc = _run(db, decision="simple", summary=None)

        assert len(svc.thread_service.saved_messages) == 1
        assert svc.thread_service.saved_messages[0]["message_id"] == "m1"


class TestPlanFinalResponseNotClobbered:
    def test_existing_summary_is_preserved(self, db):
        """计划正文已是 aggregator 写的综述 → 不得被 state 末条消息覆盖。"""
        _run(db, decision="complex", summary="聚合综述")

        db.expire_all()
        assert db.get(ExecutionPlan, "p1").final_response == "聚合综述"

    def test_empty_summary_falls_back_to_last_message(self, db):
        """正文为空时兜底写入（例如 aggregator 落库失败），不留空。"""
        _run(db, decision="complex", summary=None)

        db.expire_all()
        assert db.get(ExecutionPlan, "p1").final_response == "state 里的最后一条消息"
