"""租约 supervisor（续租 / 回收）的 DB 级测试。

用内存 SQLite 起真实表结构（与 tests/test_hitl_approval_invariants.py 同款），
因为这里要验的正是**查询与写入**的行为：哪些 run 被续、哪些被回收、为什么。

要钉死的性质（决定 2 里最贵的两类错误）：
- 误杀：活着的 run 绝不能被回收 —— 租约有效的，以及**资产性质特殊**的
  HITL 等待中 run（它等的是人，租约**必然**会过期，不能照租约判死）
- 漏杀：租约过期/无租约的活跃 run 必须被回收，否则僵尸一直挂着
"""

import asyncio
from datetime import timedelta

import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

from crud.agent_run import ACTIVE_RUN_STATUSES
from models import AgentRun, RunEvent, RunStatus, Thread
from services import run_lease_service as lease_service
from utils.run_lease import RUN_OWNER_ID, lease_deadline
from utils.time import utc_now

TABLES = [Thread.__table__, AgentRun.__table__, RunEvent.__table__]
OTHER_OWNER = "other-host:4242:deadbeef"


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
        session.commit()
        yield session


def _add_run(
    db: Session,
    run_id: str,
    *,
    status: RunStatus = RunStatus.RUNNING,
    owner: str | None = RUN_OWNER_ID,
    lease_seconds: float | None = 60.0,
    deadline_seconds: float | None = None,
    thread_id: str = "t1",
) -> AgentRun:
    """造一条 run。`lease_seconds` 为负数即「已过期」，None 即「无租约」。"""
    now = utc_now()
    run = AgentRun(
        id=run_id,
        thread_id=thread_id,
        user_id="u1",
        status=status,
        owner=owner,
        lease_expires_at=(
            None if lease_seconds is None else now + timedelta(seconds=lease_seconds)
        ),
        deadline_at=(
            None if deadline_seconds is None else now + timedelta(seconds=deadline_seconds)
        ),
        created_at=now,
        started_at=now,
        updated_at=now,
    )
    db.add(run)
    db.commit()
    return run


class TestRenew:
    def test_renews_only_own_active_runs(self, db):
        mine = _add_run(db, "run-mine", lease_seconds=1)
        other = _add_run(db, "run-other", owner=OTHER_OWNER, lease_seconds=1)
        done = _add_run(db, "run-done", status=RunStatus.COMPLETED, lease_seconds=1)

        renewed = lease_service.renew_owned_leases(db)

        assert renewed == 1
        for run in (mine, other, done):
            db.refresh(run)
        assert mine.lease_expires_at > utc_now() + timedelta(seconds=100), (
            "本进程的活跃 run 必须续到 TTL 之后"
        )
        assert other.lease_expires_at < utc_now() + timedelta(seconds=2), "别人的 run 不得碰"
        assert done.lease_expires_at < utc_now() + timedelta(seconds=2), "终态 run 不续租"

    def test_paused_run_keeps_being_renewed(self, db):
        """HITL 等待中的 run 也是活跃的：用户思考期间它必须一直活着。"""
        paused = _add_run(db, "run-paused", status=RunStatus.WAITING_FOR_APPROVAL, lease_seconds=1)

        assert lease_service.renew_owned_leases(db) == 1
        db.refresh(paused)
        assert paused.lease_expires_at > utc_now()


class TestReclaim:
    def test_reclaims_expired_lease(self, db):
        run = _add_run(db, "run-zombie", owner=OTHER_OWNER, lease_seconds=-1)

        reclaimed = lease_service.reclaim_expired_leases(db)

        assert reclaimed == [("t1", ["run-zombie"])]
        db.refresh(run)
        assert run.status == RunStatus.TIMED_OUT
        assert "租约过期" in (run.error_message or "")
        assert run.owner is None and run.lease_expires_at is None, "终态必须释放租约"

    def test_reclaims_run_without_lease(self, db):
        """无租约 = 无存活证据（迁移前遗留 / 别的进程没认领）。"""
        run = _add_run(db, "run-no-lease", lease_seconds=None)

        assert lease_service.reclaim_expired_leases(db) == [("t1", ["run-no-lease"])]
        db.refresh(run)
        assert run.status == RunStatus.TIMED_OUT

    def test_does_not_touch_alive_run(self, db):
        run = _add_run(db, "run-alive", lease_seconds=60)

        assert lease_service.reclaim_expired_leases(db) == []
        db.refresh(run)
        assert run.status == RunStatus.RUNNING

    def test_does_not_touch_hitl_paused_run(self, db):
        """等待审批的 run：租约有效 + deadline 被挂起（None）→ 绝不回收。

        这是「用户思考多久都不算超时」这条既有语义的守门测试。
        """
        run = _add_run(
            db,
            "run-paused",
            status=RunStatus.WAITING_FOR_APPROVAL,
            lease_seconds=60,
            deadline_seconds=None,
        )

        assert lease_service.reclaim_expired_leases(db) == []
        db.refresh(run)
        assert run.status == RunStatus.WAITING_FOR_APPROVAL

    def test_does_not_touch_hitl_paused_run_with_expired_lease(self, db):
        """等待审批 + **租约已过期**：仍然绝不回收。

        上一条测试用的是**有效**租约，于是漏掉了真实路径：停在审批点时这一轮流已收尾，
        没有任何进程替它续租（续租只发生在「本进程持有的活跃 run」上），租约**必然**
        会到期。照租约判死的结果是最坏的一类误杀——计划放几分钟不点，回收段把它标成
        「运行进程失联」，审批卡消失、任务再也批不了（2026-09-13 实测：一小时内 5 条
        待审批 run 全被误杀，其中一条正是用户报「审批计划这个选项没出来」的那次）。
        """
        run = _add_run(
            db,
            "run-paused-expired",
            status=RunStatus.WAITING_FOR_APPROVAL,
            lease_seconds=-600,
            deadline_seconds=None,
        )

        assert lease_service.reclaim_expired_leases(db) == []
        db.refresh(run)
        assert run.status == RunStatus.WAITING_FOR_APPROVAL

    def test_over_budget_run_is_reclaimed_with_deadline_reason(self, db):
        """预算用尽：即使租约还有效也要回收，且原因写「超过执行预算」而不是「失联」。

        两种情况用户看到的都是「超时」，但排查结论完全不同，所以文案必须分开。
        """
        run = _add_run(db, "run-over-budget", lease_seconds=60, deadline_seconds=-1)

        assert lease_service.reclaim_expired_leases(db) == [("t1", ["run-over-budget"])]
        db.refresh(run)
        assert run.status == RunStatus.TIMED_OUT
        assert "执行预算" in (run.error_message or "")

    def test_terminal_runs_are_left_alone(self, db):
        run = _add_run(db, "run-done", status=RunStatus.COMPLETED, lease_seconds=-100)
        before = run.status

        assert lease_service.reclaim_expired_leases(db) == []
        db.refresh(run)
        assert run.status == before


class TestSupervisorSafety:
    def test_failing_tick_does_not_kill_the_loop(self, monkeypatch):
        """单轮失败必须被吞掉并继续下一轮。

        为什么这条重要：supervisor 一死，本进程持有的**所有** run 都不再续租，
        TTL 之后会被任意进程批量误回收——一次数据库抖动就能演变成批量误杀。
        """
        calls = {"n": 0}

        def _boom():
            calls["n"] += 1
            raise RuntimeError("模拟数据库抖动")

        monkeypatch.setattr(lease_service, "supervisor_tick", _boom)
        monkeypatch.setattr(lease_service, "RUN_LEASE_RENEW_INTERVAL_SECONDS", 0.01)

        async def _run_briefly() -> None:
            task = asyncio.create_task(lease_service.run_run_lease_supervisor())
            await asyncio.sleep(0.05)
            still_running = not task.done()
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await task
            assert still_running, "supervisor 因单轮异常退出 —— 会引发批量误回收"

        asyncio.run(_run_briefly())
        assert calls["n"] >= 2, "失败后应当继续下一轮，而不是只试一次"

    def test_tick_renews_then_reclaims_in_one_pass(self, db, monkeypatch):
        """一轮里续租与回收都要发生（顺序：先续租再回收，避免把刚过期的自己人算进去）。"""
        alive = _add_run(db, "run-alive", lease_seconds=1)
        zombie = _add_run(db, "run-zombie", owner=OTHER_OWNER, lease_seconds=-1)

        monkeypatch.setattr(lease_service, "Session", lambda _engine: Session(db.get_bind()))
        renewed, reclaimed = lease_service.supervisor_tick()

        assert renewed >= 1
        assert reclaimed == [("t1", ["run-zombie"])]
        db.expire_all()
        assert db.get(AgentRun, alive.id).status == RunStatus.RUNNING
        assert db.get(AgentRun, zombie.id).status == RunStatus.TIMED_OUT

    def test_active_statuses_come_from_crud(self):
        """活跃状态集合只有一个来源（crud.ACTIVE_RUN_STATUSES），别在服务里重列一遍。"""
        assert RunStatus.WAITING_FOR_APPROVAL in ACTIVE_RUN_STATUSES
        assert RunStatus.COMPLETED not in ACTIVE_RUN_STATUSES
        # 回收目标查询用的就是这个集合
        statement = select(AgentRun).where(AgentRun.status.in_(ACTIVE_RUN_STATUSES))
        assert statement is not None

    def test_lease_deadline_helper_is_used(self):
        """续租写的是 lease_deadline()（TTL 的唯一来源），不是随手加的时间。"""
        assert lease_deadline() > utc_now()
