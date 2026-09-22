"""计划裁决动作的审计留痕测试（审计日志扩范围，2026-09-16）。

背景：审计日志此前只覆盖 8 个管理面动作；计划批准/修订/终止是治理语义
最强的用户动作却只在会话消息与运行时间线留痕，管理面审计页看不到。
现扩 3 个记录点（plan.approve / plan.revise / plan.terminate），锁住：

1. 三个成功路径各落恰好一条审计记录（操作者/动作/target=run:xxx/明细带 thread_id）；
2. 失败路径**不落审计**（修订缺反馈抛 ValidationError → 0 条记录）——
   审计只记做成的事，不产生「做了没做成」的误导记录；
3. 审计明细不包含反馈与计划内容（治理留痕不是内容副本）。

夹具与 test_hitl_approval_invariants 同惯例：一次性内存 SQLite。
"""

import asyncio
from unittest.mock import patch

import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

from models import AgentRun, AuditLog, ExecutionPlan, Message, RunEvent, Thread, User
from models.enums import RunStatus
from services.chat.recovery_service import RecoveryService
from utils.exceptions import ValidationError
from utils.time import utc_now

TABLES = [
    Thread.__table__,
    AgentRun.__table__,
    ExecutionPlan.__table__,
    RunEvent.__table__,
    Message.__table__,
    User.__table__,
    AuditLog.__table__,
]


@pytest.fixture
def db():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine, tables=TABLES)
    with Session(engine) as session:
        now = utc_now()
        session.add(User(id="u1", username="tester"))
        session.add(Thread(id="t1", title="会话", user_id="u1"))
        session.add(
            AgentRun(
                id="r1",
                thread_id="t1",
                user_id="u1",
                status=RunStatus.WAITING_FOR_APPROVAL,
                created_at=now,
                updated_at=now,
            )
        )
        session.add(
            ExecutionPlan(
                id="p1", thread_id="t1", user_query="做个页面", run_id="r1", plan_version=1
            )
        )
        session.commit()
        yield session
    engine.dispose()


def _audit_rows(db: Session) -> list[AuditLog]:
    return list(db.exec(select(AuditLog)).all())


async def _noop_cleanup(*_args, **_kwargs) -> None:
    return None


# 同步测试里驱动异步服务方法（asyncio_mode=auto 只作用于 async 测试函数）
asyncio_run = asyncio.run


class TestTerminateAudit:
    async def test_success_writes_one_row(self, db):
        svc = RecoveryService(db)
        with patch("utils.db.cleanup_terminal_run", _noop_cleanup):
            result = await svc.resume_chat("t1", "r1", "u1", approved=False, feedback="不要了")

        assert result["status"] == "cancelled"
        rows = _audit_rows(db)
        assert len(rows) == 1, f"应恰好一条终止审计，实际 {len(rows)}"
        row = rows[0]
        assert row.action == "plan.terminate"
        assert row.actor_user_id == "u1"
        assert row.actor_username == "tester"
        assert row.target == "run:r1"
        assert row.detail["thread_id"] == "t1"
        assert row.detail["has_feedback"] is True
        # 治理留痕不是内容副本：反馈原文不进审计
        assert "不要了" not in str(row.detail)


class TestReviseAudit:
    async def test_success_writes_one_row(self, db):
        svc = RecoveryService(db)
        result = await svc.resume_chat(
            "t1", "r1", "u1", approved=True, action="revise", feedback="改一下首页部分"
        )

        assert result["status"] == "revising"
        rows = _audit_rows(db)
        assert len(rows) == 1
        row = rows[0]
        assert row.action == "plan.revise"
        assert row.detail["plan_version"] is None  # 请求未带版本号，如实记录
        assert "改一下首页部分" not in str(row.detail)

    async def test_missing_feedback_writes_nothing(self, db):
        svc = RecoveryService(db)
        with pytest.raises(ValidationError):
            await svc.resume_chat("t1", "r1", "u1", approved=True, action="revise", feedback="  ")

        assert _audit_rows(db) == [], "失败路径不得产生审计记录"


class TestApproveAudit:
    async def test_success_writes_one_row(self, db):
        svc = RecoveryService(db)
        response = await svc.resume_chat(
            "t1",
            "r1",
            "u1",
            approved=True,
            action="approve",
            plan_version=1,
            updated_plan=None,
        )

        # 批准路径返回 SSE 流响应（生成器未启动即返回，测试只验审计）
        assert response is not None
        rows = _audit_rows(db)
        assert len(rows) == 1
        row = rows[0]
        assert row.action == "plan.approve"
        assert row.detail["plan_version"] == 1
        assert row.detail["plan_modified"] is False


class TestListAuditLogs:
    """回归：列表查询的计数写法（.first()[0] 在本版本 sqlmodel 上炸，
    接口 500 → 面板吞错渲染成空态——审计页从上线起就没出过列表）。"""

    def _add_second_run(self, db: Session) -> None:
        now = utc_now()
        db.add(
            AgentRun(
                id="r2",
                thread_id="t1",
                user_id="u1",
                status=RunStatus.WAITING_FOR_APPROVAL,
                created_at=now,
                updated_at=now,
            )
        )
        db.add(
            ExecutionPlan(
                id="p2", thread_id="t1", user_query="第二任务", run_id="r2", plan_version=1
            )
        )
        db.commit()

    def test_list_returns_entries_and_total(self, db):
        from crud.audit_log import list_audit_logs

        self._add_second_run(db)
        svc = RecoveryService(db)
        with patch("utils.db.cleanup_terminal_run", _noop_cleanup):
            asyncio_run(svc.resume_chat("t1", "r1", "u1", approved=False, feedback=None))
            asyncio_run(
                svc.resume_chat("t1", "r2", "u1", approved=True, action="revise", feedback="改")
            )

        entries, total = list_audit_logs(db)
        assert total == 2
        assert [e.action for e in entries] == ["plan.revise", "plan.terminate"]  # 时间倒序

    def test_search_filters(self, db):
        from crud.audit_log import list_audit_logs

        self._add_second_run(db)
        svc = RecoveryService(db)
        with patch("utils.db.cleanup_terminal_run", _noop_cleanup):
            asyncio_run(svc.resume_chat("t1", "r1", "u1", approved=False, feedback=None))
            asyncio_run(
                svc.resume_chat("t1", "r2", "u1", approved=True, action="revise", feedback="改")
            )

        entries, total = list_audit_logs(db, search="plan.terminate")
        assert total == 1
        assert entries[0].action == "plan.terminate"
