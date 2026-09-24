"""审批超时机制（2026-09-24）的语义测试。

三个层次各钉一条：
1. 纯判定（utils/run_lease.approval_deadline_exceeded）——「等人等太久」的
   定义只有一处：None 不判死、配置 0 关闭、过期才 True
2. 巡检分支（services/run_lease_service.reclaim_expired_leases）——超时的
   waiting run 被取消且会话留可见说明；未超时的一律不碰（09-13 误杀的
   回归线：等待审批永远不走租约/预算判死）
3. 计时起点（crud/agent_run.update_run_status）——状态切入等待时盖章

为什么值得测：这个机制补的是「被遗弃的等待无退出机制」的空档，但它紧挨着
一条血泪铁律（waiting 无条件存活）。测试钉死两条边：既不能误杀新鲜的等待
（09-13 事故），也不能放走遗弃的等待（09-23 的 immortal waiter）。
"""

from datetime import timedelta

from crud.agent_run import update_run_status
from models import AgentRun, RunStatus, Thread
from services.run_lease_service import APPROVAL_TIMEOUT_NOTE_KIND, reclaim_expired_leases
from utils.run_lease import approval_deadline_exceeded
from utils.time import utc_now


def _waiting_run(*, waiting_since=None, run_id="run-w1", thread_id="thread-1") -> AgentRun:
    return AgentRun(
        id=run_id,
        thread_id=thread_id,
        user_id="user-1",
        status=RunStatus.WAITING_FOR_APPROVAL,
        current_node="approval",
        created_at=utc_now() - timedelta(hours=25),
        started_at=utc_now() - timedelta(hours=25),
        updated_at=utc_now() - timedelta(hours=25),
        waiting_since_at=waiting_since,
    )


# ---------- 1. 纯判定 ----------


def test_approval_deadline_none_never_expires():
    assert approval_deadline_exceeded(None, timeout_hours=24) is False


def test_approval_deadline_zero_disables_mechanism():
    fresh = utc_now() - timedelta(hours=48)
    assert approval_deadline_exceeded(fresh, timeout_hours=0) is False


def test_approval_deadline_expired_and_fresh():
    expired = utc_now() - timedelta(hours=25)
    fresh = utc_now() - timedelta(hours=1)
    assert approval_deadline_exceeded(expired, timeout_hours=24) is True
    assert approval_deadline_exceeded(fresh, timeout_hours=24) is False


# ---------- 2. 巡检分支 ----------


class _FakeResult:
    def __init__(self, items):
        self._items = list(items)

    def all(self):
        return list(self._items)

    def first(self):
        return self._items[0] if self._items else None


class _FakeSession:
    """supervisor 回收路径的最小会话桩：按查询目标路由 + 收集插入的 Message。"""

    def __init__(self, runs, thread):
        self.runs = runs
        self.thread = thread
        self.notes: list = []
        self.committed = 0

    def add(self, obj):
        # Message=审批超时说明；AgentRun/Thread 原地对象即断言载体
        if obj.__class__.__name__ == "Message":
            self.notes.append(obj)

    def commit(self):
        self.committed += 1

    def get(self, model, object_id):
        if model is Thread and object_id == self.thread.id:
            return self.thread
        if model is AgentRun:
            return next((r for r in self.runs if r.id == object_id), None)
        return None

    def _session_exec(self, statement):
        sql = str(statement)
        if "FROM subtask" in sql or "FROM executionplan" in sql:
            return _FakeResult([])
        if "FROM agentrun" in sql:
            return _FakeResult(self.runs)
        return _FakeResult([])

    exec = _session_exec


def _thread():
    return Thread(
        id="thread-1",
        title="demo",
        user_id="user-1",
        agent_type="ai",
        agent_id="sys-default-chat",
        status="paused",
    )


def test_expired_waiting_run_cancelled_with_visible_note():
    run = _waiting_run(waiting_since=utc_now() - timedelta(hours=25))
    session = _FakeSession([run], _thread())

    reclaimed = reclaim_expired_leases(session)

    assert run.status == RunStatus.CANCELLED
    assert run.cancelled_at is not None
    assert len(reclaimed) == 1 and reclaimed[0][0] == "thread-1"
    # 会话必须留下可见说明（否则用户体验=09-13 的审批卡凭空消失）
    assert len(session.notes) == 1
    assert session.notes[0].role == "assistant"
    assert session.notes[0].extra_data["message_kind"] == APPROVAL_TIMEOUT_NOTE_KIND
    assert session.notes[0].extra_data["run_id"] == run.id


def test_fresh_waiting_run_never_touched():
    run = _waiting_run(waiting_since=utc_now() - timedelta(hours=1))
    session = _FakeSession([run], _thread())

    reclaimed = reclaim_expired_leases(session)

    assert run.status == RunStatus.WAITING_FOR_APPROVAL
    assert reclaimed == []
    assert session.notes == []


def test_waiting_without_stamp_never_touched():
    # 历史行（无计时起点）不判死——宁可漏杀不可误杀（09-13 教训）
    run = _waiting_run(waiting_since=None)
    session = _FakeSession([run], _thread())

    reclaimed = reclaim_expired_leases(session)

    assert run.status == RunStatus.WAITING_FOR_APPROVAL
    assert reclaimed == []


# ---------- 3. 计时起点 ----------


def test_update_run_status_stamps_waiting_since():
    run = AgentRun(
        id="run-s1",
        thread_id="thread-1",
        user_id="user-1",
        status=RunStatus.RUNNING,
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    before = utc_now()
    session = _FakeSession([run], _thread())

    update_run_status(session, run, RunStatus.WAITING_FOR_APPROVAL)

    assert run.waiting_since_at is not None
    assert run.waiting_since_at >= before

    # 离开等待不回擦（保留审计痕迹），重入等待重新盖章
    old_stamp = run.waiting_since_at
    update_run_status(session, run, RunStatus.RESUMING)
    assert run.waiting_since_at == old_stamp
    update_run_status(session, run, RunStatus.WAITING_FOR_APPROVAL)
    assert run.waiting_since_at >= old_stamp
