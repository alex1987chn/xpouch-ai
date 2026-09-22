"""HITL 审批链路的**行为特征测试**（批次 B0）。

目的：在批次 B3（审批迁 `interrupt()`/`Command(resume)`）动刀之前，把
「迁移不该改变的东西」固化下来。这里覆盖的全是**业务规则与并发正确性**，
不是待删除的脚手架——B3 做完这些断言必须仍然成立。

覆盖范围（DB 级不变量，用一次性内存 SQLite，与既有测试同一惯例）：
  1. 计划版本乐观锁 CAS（多端并发审批的正确性保障）
  2. 恢复请求 in-flight 去重（同 key 重放 vs 异 key 竞争）
  3. 执行预算的挂起/重置（审批等待期不消耗 deadline）
  4. 修订悬置兜底（进程重启后把悬置的修订标为失败）

不在本文件覆盖（需要图 + checkpoint 的集成夹具，随 B3 一并补）：
  - 端到端 resume：图停在审批点 → Command(resume) → 从断点继续
  - cancel-during-wait、幂等重放的端到端路径

注意：这些测试**测的是当前实现**。若某条断言在重构后失败，先判断是
「重构引入了回归」还是「该行为本就该改」——不要直接改断言来让测试变绿。
"""

import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from crud.run_event import fail_stale_revision_jobs
from models import AgentRun, ExecutionPlan, RunEvent, Thread
from models.enums import RunEventType, RunStatus
from services.chat.recovery_service import RecoveryService
from services.chat.run_lifecycle import pause_deadline, reset_deadline
from utils.error_codes import ErrorCode
from utils.exceptions import AppError, NotFoundError, ValidationError
from utils.time import utc_now

TABLES = [
    Thread.__table__,
    ExecutionPlan.__table__,
    AgentRun.__table__,
    RunEvent.__table__,
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
        yield session


def _make_plan(
    db: Session, *, plan_id: str = "p1", run_id: str = "r1", version: int = 1
) -> ExecutionPlan:
    db.add(Thread(id="t1", title="会话", user_id="u1"))
    db.add(AgentRun(id=run_id, thread_id="t1", user_id="u1", status="waiting_for_approval"))
    plan = ExecutionPlan(
        id=plan_id, thread_id="t1", user_query="q", run_id=run_id, plan_version=version
    )
    db.add(plan)
    db.commit()
    return plan


# ---------------------------------------------------------------------------
# 1. 计划版本乐观锁 CAS
# ---------------------------------------------------------------------------


class TestPlanVersionCas:
    """多端同时审批时，只有拿着最新版本的一端能推进计划。

    这是跨进程/跨请求的正确性保障，LangGraph 不提供，**必须保留**。
    """

    def _service(self, db: Session) -> RecoveryService:
        svc = RecoveryService.__new__(RecoveryService)
        svc.db = db
        return svc

    def test_bumps_version_when_expected_matches(self, db):
        plan = _make_plan(db, version=1)
        self._service(db)._bump_plan_version_with_cas("r1", 1)
        db.refresh(plan)
        assert plan.plan_version == 2

    def test_stale_version_raises_conflict_and_leaves_version_untouched(self, db):
        plan = _make_plan(db, version=2)
        with pytest.raises(AppError) as exc:
            self._service(db)._bump_plan_version_with_cas("r1", 1)
        assert exc.value.code == ErrorCode.PLAN_VERSION_CONFLICT
        assert exc.value.status_code == 409
        db.refresh(plan)
        assert plan.plan_version == 2, "冲突时不得改写版本号"

    def test_missing_plan_version_is_rejected(self, db):
        _make_plan(db)
        with pytest.raises(ValidationError):
            self._service(db)._bump_plan_version_with_cas("r1", None)

    def test_missing_plan_is_not_found(self, db):
        with pytest.raises(NotFoundError):
            self._service(db)._bump_plan_version_with_cas("no-such-run", 1)


# ---------------------------------------------------------------------------
# 2. 恢复请求 in-flight 去重
# ---------------------------------------------------------------------------


class TestResumeInflightDedup:
    """进程内占位，防止重复/并发的恢复请求同时推进同一个 run。"""

    def setup_method(self):
        # 每个用例从干净的占位表开始（conftest 另有 autouse fixture 兜底）
        RecoveryService._inflight_resume_by_run.clear()

    def test_same_key_twice_is_duplicate_request(self):
        RecoveryService._enter_inflight_resume("r1", "key-a")
        with pytest.raises(AppError) as exc:
            RecoveryService._enter_inflight_resume("r1", "key-a")
        assert exc.value.code == ErrorCode.RESUME_DUPLICATE_REQUEST
        assert exc.value.status_code == 409

    def test_different_key_while_held_is_in_progress(self):
        RecoveryService._enter_inflight_resume("r1", "key-a")
        with pytest.raises(AppError) as exc:
            RecoveryService._enter_inflight_resume("r1", "key-b")
        assert exc.value.code == ErrorCode.RESUME_IN_PROGRESS
        assert exc.value.status_code == 409

    def test_release_allows_reentry(self):
        RecoveryService._enter_inflight_resume("r1", "key-a")
        RecoveryService._exit_inflight_resume("r1", "key-a")
        RecoveryService._enter_inflight_resume("r1", "key-a")  # 不应抛出

    def test_exit_only_releases_own_key(self):
        """异 key 不得释放他人占位——否则并发保护会被绕过。"""
        RecoveryService._enter_inflight_resume("r1", "key-a")
        RecoveryService._exit_inflight_resume("r1", "key-b")
        assert RecoveryService._inflight_resume_by_run.get("r1") == "key-a"

    def test_different_runs_do_not_interfere(self):
        RecoveryService._enter_inflight_resume("r1", "key-a")
        RecoveryService._enter_inflight_resume("r2", "key-a")  # 不应抛出

    @pytest.mark.parametrize(
        ("idempotency_key", "message_id", "plan_version", "expected"),
        [
            ("explicit", "msg", 3, "explicit"),
            (None, "msg", 3, "msg:msg"),
            (None, None, 3, "r1:3"),
        ],
    )
    def test_resume_key_derivation_priority(
        self, idempotency_key, message_id, plan_version, expected
    ):
        assert (
            RecoveryService._build_resume_key("r1", plan_version, message_id, idempotency_key)
            == expected
        )


# ---------------------------------------------------------------------------
# 3. 执行预算的挂起 / 重置
# ---------------------------------------------------------------------------


class TestDeadlinePauseResume:
    """审批等待期不消耗执行预算——这是官方 TimeoutPolicy 无法表达的业务语义。

    进入等待态时挂起（deadline_at 置 NULL），每轮批准时重置完整预算。
    """

    def _run_with_deadline(self, db: Session, run_id: str = "r1") -> AgentRun:
        db.add(Thread(id="t1", title="会话", user_id="u1"))
        run = AgentRun(
            id=run_id,
            thread_id="t1",
            user_id="u1",
            deadline_at=utc_now(),
        )
        db.add(run)
        db.commit()
        return run

    def test_pause_clears_deadline(self, db):
        run = self._run_with_deadline(db)
        pause_deadline(db, "r1")
        db.refresh(run)
        assert run.deadline_at is None

    def test_pause_is_idempotent_when_already_paused(self, db):
        run = self._run_with_deadline(db)
        pause_deadline(db, "r1")
        pause_deadline(db, "r1")  # 二次挂起不应报错
        db.refresh(run)
        assert run.deadline_at is None

    def test_reset_sets_future_deadline(self, db):
        run = self._run_with_deadline(db)
        pause_deadline(db, "r1")
        reset_deadline(db, "r1", 900)
        db.refresh(run)
        assert run.deadline_at is not None
        remaining = (run.deadline_at - utc_now()).total_seconds()
        assert 895 <= remaining <= 900, f"重置后应剩约 900s，实际 {remaining}"

    def test_pause_on_missing_run_is_noop(self, db):
        pause_deadline(db, "no-such-run")  # 不应抛出


# ---------------------------------------------------------------------------
# 4. 修订悬置兜底（进程重启）
# ---------------------------------------------------------------------------


class TestStaleRevisionFallback:
    """BackgroundTasks 不随进程存活：重启会让「修订中」永远悬置。

    兜底对超时仍未终态的 run 补写 HITL_REVISION_FAILED（原计划保持待审）。

    回归背景：该函数自 v3.5.0 起**从未生效**——它引用了 RunEvent.created_at，
    而模型字段名是 created_at，AttributeError 被 main.py 的 try/except 吞掉。
    2026-09-13 修复，这些用例锁住修复。
    """

    def _emit(self, db: Session, run_id: str, event_type: RunEventType, *, ago_seconds: int = 0):
        from datetime import timedelta

        # 评审后语义收窄：fail_stale_revision_jobs 只扫**活跃 run**（join AgentRun），
        # 所以每个用例需要一个 RUNNING 的归属 run（与生产一致：事件必有归属 run）。
        # 同一 run 多次 emit 时复用已有行（测试里同 run 会发多个事件）。
        if db.get(AgentRun, run_id) is None:
            db.add(
                AgentRun(
                    id=run_id,
                    thread_id="t1",
                    user_id="u1",
                    status=RunStatus.RUNNING,
                    mode="complex",
                    created_at=utc_now(),
                    updated_at=utc_now(),
                )
            )
        ev = RunEvent(
            run_id=run_id,
            event_type=event_type,
            thread_id="t1",
            execution_plan_id="p1",
            event_data={"plan_version": 1},
            created_at=utc_now() - timedelta(seconds=ago_seconds),
        )
        db.add(ev)
        db.commit()
        return ev

    def _event_types(self, db: Session, run_id: str) -> list[str]:
        from sqlmodel import select

        rows = db.exec(
            select(RunEvent).where(RunEvent.run_id == run_id).order_by(RunEvent.created_at)
        ).all()
        return [str(r.event_type) for r in rows]

    def test_stale_revision_is_marked_failed(self, db):
        self._emit(db, "r1", RunEventType.HITL_REVISION_STARTED, ago_seconds=3600)
        repaired = fail_stale_revision_jobs(db, stale_after_seconds=1800)
        assert repaired == 1
        assert RunEventType.HITL_REVISION_FAILED in self._event_types(db, "r1")

    def test_fresh_revision_is_left_alone(self, db):
        self._emit(db, "r2", RunEventType.HITL_REVISION_STARTED, ago_seconds=10)
        repaired = fail_stale_revision_jobs(db, stale_after_seconds=1800)
        assert repaired == 0
        assert RunEventType.HITL_REVISION_FAILED not in self._event_types(db, "r2")

    def test_revision_already_terminal_is_left_alone(self, db):
        """STARTED 之后已有终态事件（PLAN_UPDATED）→ 不算悬置。"""
        self._emit(db, "r3", RunEventType.HITL_REVISION_STARTED, ago_seconds=3600)
        self._emit(db, "r3", RunEventType.PLAN_UPDATED, ago_seconds=3500)
        repaired = fail_stale_revision_jobs(db, stale_after_seconds=1800)
        assert repaired == 0

    def test_failed_revision_already_repaired_is_not_double_counted(self, db):
        """幂等：已在 STARTED 之后补过 FAILED 的 run 不应被再次处理。"""
        self._emit(db, "r4", RunEventType.HITL_REVISION_STARTED, ago_seconds=3600)
        self._emit(db, "r4", RunEventType.HITL_REVISION_FAILED, ago_seconds=3500)
        repaired = fail_stale_revision_jobs(db, stale_after_seconds=1800)
        assert repaired == 0
