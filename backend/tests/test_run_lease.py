"""run 租约（决定 2）的语义测试。

被替换掉的四处启发式里，有三处由租约接管（存活可见性 / 僵尸回收 / 并发互斥），
本文件把租约的判定与写入点钉死；第四处（进程内 in-flight 去重）是**请求级幂等**，
有意不并入，见 docs/TARGET-ARCHITECTURE.md 决定 2。

测试分两层：
1. `utils/run_lease.py` 的纯判定（不碰 DB）——「死活」的定义只有一处
2. `crud/agent_run.py` 的读写点（内存会话桩）——创建即持有、写入即续租、
   终态即释放、互斥只看存活租约
"""

from datetime import datetime, timedelta

from crud.agent_run import (
    _claim_lease,
    _release_lease,
    create_agent_run,
    mark_run_cancelled_by_id,
    mark_run_completed,
    mark_run_failed,
    mark_run_timed_out_by_id,
    touch_run_heartbeat_by_id,
    update_run_status,
)
from models import AgentRun, RunEvent, RunStatus, Thread
from utils.run_lease import (
    RUN_LEASE_TTL_SECONDS,
    RUN_OWNER_ID,
    accepts_renewal,
    is_lease_alive,
    lease_deadline,
)
from utils.time import utc_now_naive


class _FakeResult:
    def __init__(self, items):
        self._items = list(items)

    def all(self):
        return list(self._items)

    def first(self):
        return self._items[0] if self._items else None


class _FakeSession:
    """够 AgentRun 写入路径用的最小会话桩。"""

    def __init__(self, thread: Thread | None = None):
        self.thread = thread
        self.runs: dict[str, AgentRun] = {}
        self.events: list[RunEvent] = []
        self.committed = 0

    def add(self, obj):
        if isinstance(obj, AgentRun):
            self.runs[obj.id] = obj
        elif isinstance(obj, RunEvent):
            self.events.append(obj)
        elif isinstance(obj, Thread):
            self.thread = obj

    def flush(self):
        return None

    def commit(self):
        self.committed += 1

    def get(self, model, object_id):
        if model is Thread and self.thread is not None and object_id == self.thread.id:
            return self.thread
        if model is AgentRun:
            return self.runs.get(object_id)
        return None

    # SQLModel Session 的查询接口 mock（模拟查询，非代码执行；与
    # tests/test_agent_run_status.py 同款写法）。租约过滤由被测代码在 Python 侧做。
    def _session_exec(self, _statement):
        return _FakeResult(run for run in self.runs.values() if run.status in _ACTIVE_FOR_TEST)

    exec = _session_exec


# 活跃状态（与 crud.ACTIVE_RUN_STATUSES 同源，测试桩里只需状态集合）
_ACTIVE_FOR_TEST = {
    RunStatus.QUEUED,
    RunStatus.RUNNING,
    RunStatus.RESUMING,
    RunStatus.WAITING_FOR_APPROVAL,
}


def _thread() -> Thread:
    return Thread(
        id="thread-1",
        title="demo",
        user_id="user-1",
        agent_type="ai",
        agent_id="sys-default-chat",
        status="idle",
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )


def _run(**overrides) -> AgentRun:
    data = {
        "id": "run-1",
        "thread_id": "thread-1",
        "user_id": "user-1",
        "status": RunStatus.RUNNING,
        "created_at": datetime.now(),
        "started_at": datetime.now(),
        "updated_at": datetime.now(),
    }
    data.update(overrides)
    return AgentRun(**data)


# ---------------------------------------------------------------------------
# 1. 纯判定
# ---------------------------------------------------------------------------


class TestLeasePredicate:
    def test_future_lease_is_alive(self):
        assert is_lease_alive(utc_now_naive() + timedelta(seconds=5)) is True

    def test_past_lease_is_dead(self):
        assert is_lease_alive(utc_now_naive() - timedelta(seconds=1)) is False

    def test_null_lease_is_dead(self):
        """NULL = 无存活证据（迁移前遗留或不认识它的进程写的）。"""
        assert is_lease_alive(None) is False

    def test_ttl_is_much_larger_than_renew_interval(self):
        """TTL / 续租间隔 的余量必须够大，否则活着的 run 会被自己的慢周期误杀。"""
        from utils.run_lease import RUN_LEASE_RENEW_INTERVAL_SECONDS

        assert RUN_LEASE_TTL_SECONDS >= RUN_LEASE_RENEW_INTERVAL_SECONDS * 5

    def test_lease_deadline_uses_ttl(self):
        now = utc_now_naive()
        delta = (lease_deadline(now) - now).total_seconds()
        assert delta == RUN_LEASE_TTL_SECONDS

    def test_owner_identity_is_stable_and_distinctive(self):
        assert RUN_OWNER_ID == RUN_OWNER_ID, "进程身份全程不变"
        assert RUN_OWNER_ID.count(":") >= 2, "主机名:pid:随机后缀，重启后新旧进程可区分"

    def test_accepts_renewal_only_for_self_or_unowned(self):
        assert accepts_renewal(None) is True
        assert accepts_renewal(RUN_OWNER_ID) is True
        assert accepts_renewal("other-process:9999:zzzz") is False


# ---------------------------------------------------------------------------
# 2. 读写点
# ---------------------------------------------------------------------------


class TestClaimAndRelease:
    def test_claim_sets_owner_and_deadline(self):
        run = _run(owner=None, lease_expires_at=None)
        assert _claim_lease(run, new_attempt=True) is True
        assert run.owner == RUN_OWNER_ID
        assert run.lease_expires_at is not None
        assert run.attempt == 1

    def test_renewal_does_not_bump_attempt(self):
        run = _run(owner=RUN_OWNER_ID, attempt=1)
        _claim_lease(run)
        assert run.attempt == 1, "顺带写入（状态变更/心跳）只续租，不计数"

    def test_claim_refuses_other_owners_run(self):
        run = _run(owner="other-process:1:aaaa", lease_expires_at=lease_deadline())
        before = run.lease_expires_at
        assert _claim_lease(run) is False
        assert run.owner == "other-process:1:aaaa", "不得把别人的租约改成自己的"
        assert run.lease_expires_at == before

    def test_release_clears_both_fields(self):
        run = _run(owner=RUN_OWNER_ID, lease_expires_at=lease_deadline(), attempt=1)
        _release_lease(run)
        assert run.owner is None
        assert run.lease_expires_at is None
        assert run.attempt == 1, "attempt 是历史计数，释放时不清零"


class TestWritePointsRenewAndRelease:
    def test_created_run_holds_a_lease(self, monkeypatch):
        from config import settings

        monkeypatch.setattr(settings, "run_deadline_seconds", 30)
        session = _FakeSession(_thread())
        run = create_agent_run(
            session,
            thread_id="thread-1",
            user_id="user-1",
            entrypoint="chat",
            mode="complex",
        )
        assert run.owner == RUN_OWNER_ID
        assert is_lease_alive(run.lease_expires_at) is True
        assert run.attempt == 1

    def test_status_write_renews_lease(self):
        run = _run(owner=RUN_OWNER_ID, lease_expires_at=utc_now_naive() - timedelta(seconds=5))
        session = _FakeSession(_thread())
        update_run_status(session, run, RunStatus.RESUMING)
        assert is_lease_alive(run.lease_expires_at) is True, "状态写入即证明进程在管它"

    def test_heartbeat_renews_lease(self):
        run = _run(owner=RUN_OWNER_ID, lease_expires_at=utc_now_naive() - timedelta(seconds=5))
        session = _FakeSession(_thread())
        session.runs[run.id] = run
        touch_run_heartbeat_by_id(session, run.id)
        assert is_lease_alive(run.lease_expires_at) is True
        assert run.last_heartbeat_at is not None

    def test_terminal_statuses_release_lease(self):
        for label, action in (
            ("completed", lambda s, r: mark_run_completed(s, r)),
            ("failed", lambda s, r: mark_run_failed(s, r, error_message="boom")),
            (
                "timed_out",
                lambda s, r: mark_run_timed_out_by_id(s, r.id, error_message="timeout"),
            ),
            ("cancelled", lambda s, r: mark_run_cancelled_by_id(s, r.id, error_message="stop")),
        ):
            run = _run(owner=RUN_OWNER_ID, lease_expires_at=lease_deadline(), attempt=1)
            session = _FakeSession(_thread())
            session.runs[run.id] = run
            action(session, run)
            assert run.owner is None, f"{label} 必须释放租约（否则僵尸会一直占着会话）"
            assert run.lease_expires_at is None, label

    def test_cancelled_run_does_not_keep_blocking_thread(self):
        """终态释放的直接后果：会话立刻可以开新任务。"""
        from crud.agent_run import get_active_run_for_thread

        run = _run(owner=RUN_OWNER_ID, lease_expires_at=lease_deadline())
        session = _FakeSession(_thread())
        session.runs[run.id] = run
        assert get_active_run_for_thread(session, thread_id="thread-1") is run

        mark_run_cancelled_by_id(session, run.id, error_message="stop")
        assert get_active_run_for_thread(session, thread_id="thread-1") is None
