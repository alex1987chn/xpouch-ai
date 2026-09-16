"""终态 run 的审批守卫（2026-09-13 用户实测踩到的坑）。

现象：早上被**驳回**的任务（run 已 cancelled），晚上刷新页面后审批卡又出现了，
点「批准」报错。两层原因：
  1. 后端当时**没有**这道守卫——批准一个终态 run 会先把它从 cancelled **翻回
     RESUMING**、重置 deadline、改计划状态，然后在更深处失败（checkpoint 早已被
     终态清理删掉）。用户看到莫名其妙的错误，而 run 状态已被改花。
  2. 前端那张卡没有任何机制会随 run 的终态撤下（已在前端修：轮询到终态清 pendingPlan）。

本文件锁住第 1 条：**approve / revise 只对还在等审批的 run 成立**，终态一律明确 409；
terminate 不拦（对已取消的 run 再取消是幂等的）。
"""

import asyncio

import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from models import AgentRun, AuditLog, ExecutionPlan, Message, RunEvent, Thread, User
from services.chat.recovery_service import RecoveryService
from utils.error_codes import ErrorCode
from utils.exceptions import AppError

# 审计扩范围后 resume_chat 的成功路径会落审计/反馈消息/账本，
# 夹具需带上对应表（守卫拒绝路径不触碰它们）
TABLES = [
    Thread.__table__,
    AgentRun.__table__,
    ExecutionPlan.__table__,
    RunEvent.__table__,
    Message.__table__,
    User.__table__,
    AuditLog.__table__,
]

TERMINAL = ["cancelled", "completed", "failed", "timed_out"]


@pytest.fixture
def db():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine, tables=TABLES)
    with Session(engine) as session:
        yield session


def _seed(db: Session, status: str, run_id: str = "r1") -> None:
    db.add(Thread(id="t1", title="会话", user_id="u1"))
    db.add(AgentRun(id=run_id, thread_id="t1", user_id="u1", status=status))
    db.commit()


def _service(db: Session) -> RecoveryService:
    svc = RecoveryService.__new__(RecoveryService)
    svc.db = db
    return svc


class TestTerminalRunGuard:
    @pytest.mark.parametrize("status", TERMINAL)
    def test_approve_on_terminal_run_is_rejected(self, db, status):
        _seed(db, status)

        with pytest.raises(AppError) as exc:
            asyncio.run(
                _service(db).resume_chat(thread_id="t1", run_id="r1", user_id="u1", approved=True)
            )

        assert exc.value.code == ErrorCode.RESUME_INVALID_STATE
        assert exc.value.status_code == 409
        db.expire_all()
        assert db.get(AgentRun, "r1").status == status, "终态不得被批准流程改写（曾翻回 resuming）"

    @pytest.mark.parametrize("status", TERMINAL)
    def test_revise_on_terminal_run_is_rejected(self, db, status):
        _seed(db, status)

        with pytest.raises(AppError) as exc:
            asyncio.run(
                _service(db).resume_chat(
                    thread_id="t1",
                    run_id="r1",
                    user_id="u1",
                    approved=False,
                    action="revise",
                    feedback="改成两个任务",
                )
            )

        assert exc.value.code == ErrorCode.RESUME_INVALID_STATE

    def test_paused_run_is_not_blocked(self, db, monkeypatch):
        """守卫只拦终态：等审批中的 run 必须照常走到审批流程。"""
        _seed(db, "waiting_for_approval")
        sentinel = object()
        reached: dict[str, bool] = {}

        async def _fake_approval(*_args, **_kwargs):
            reached["approval"] = True
            return sentinel

        monkeypatch.setattr(RecoveryService, "_handle_approval", _fake_approval)

        result = asyncio.run(
            _service(db).resume_chat(
                thread_id="t1", run_id="r1", user_id="u1", approved=True, plan_version=1
            )
        )

        assert result is sentinel and reached.get("approval") is True

    def test_terminate_on_terminal_run_is_still_allowed(self, db, monkeypatch):
        """terminate 有意不拦：重复终止是幂等的（旧卡片上点第二次不该报「已结束」）。"""
        _seed(db, "cancelled")
        sentinel = object()
        reached: dict[str, bool] = {}

        async def _fake_rejection(*_args, **_kwargs):
            reached["rejection"] = True
            return sentinel

        monkeypatch.setattr(RecoveryService, "_handle_rejection", _fake_rejection)

        result = asyncio.run(
            _service(db).resume_chat(
                thread_id="t1", run_id="r1", user_id="u1", approved=False, action="terminate"
            )
        )

        assert result is sentinel and reached.get("rejection") is True
