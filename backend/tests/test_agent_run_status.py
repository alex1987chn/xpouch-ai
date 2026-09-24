from datetime import datetime, timedelta

from config import settings
from crud.agent_run import (
    create_agent_run,
    derive_thread_status_from_run_status,
    ensure_no_active_run_for_thread,
    mark_run_cancelled_by_id,
    mark_run_completed,
    mark_run_failed,
    mark_run_timed_out_by_id,
    touch_run_heartbeat_by_id,
    update_run_status,
)
from models import AgentRun, RunEvent, RunEventType, RunStatus, Thread
from utils.error_codes import ErrorCode
from utils.exceptions import AppError
from utils.run_lease import RUN_OWNER_ID, lease_deadline
from utils.time import utc_now


class _FakeSession:
    def __init__(self, thread: Thread):
        self.thread = thread
        self.runs: dict[str, AgentRun] = {}
        self.events: list[RunEvent] = []
        self.subtasks: list[object] = []
        self.plans: list[object] = []
        self.commit_called = False

    def add(self, obj):
        if isinstance(obj, AgentRun):
            self.runs[obj.id] = obj
        elif isinstance(obj, RunEvent):
            self.events.append(obj)
        elif isinstance(obj, Thread):
            self.thread = obj
        else:
            # SubTask / ExecutionPlan 等领域行：收口路径会改字段后 add 回来，
            # 原地对象即断言载体，无需登记
            pass

    def flush(self):
        return None

    def commit(self):
        self.commit_called = True

    def get(self, model, object_id):
        if model is Thread and object_id == self.thread.id:
            return self.thread
        if model is AgentRun:
            return self.runs.get(object_id)
        return None

    # SQLModel Session.exec 接口的 mock（模拟查询，非代码执行）。按查询目标
    # 路由：终态收口会分别查 agentrun / subtask / executionplan
    def _session_exec(self, statement):
        sql = str(statement)
        if "FROM executionplan" in sql or "FROM execution_plan" in sql:
            # 模拟收口查询的 WHERE status IN (未终态)——与下方 active_runs
            # 过滤同一手法：桩替身执行查询语义
            return _FakeResult(
                [
                    p
                    for p in self.plans
                    if str(p.status) in ("pending", "waiting_for_approval", "running")
                ]
            )
        if "FROM subtask" in sql:
            return _FakeResult(self.subtasks)
        active_runs = [
            run
            for run in self.runs.values()
            if run.status
            in {
                RunStatus.QUEUED,
                RunStatus.RUNNING,
                RunStatus.RESUMING,
                RunStatus.WAITING_FOR_APPROVAL,
            }
        ]
        return _FakeResult(active_runs)

    exec = _session_exec


class _FakeResult:
    def __init__(self, items):
        self._items = items

    def first(self):
        return self._items[0] if self._items else None

    def all(self):
        return list(self._items)


def test_derive_thread_status_from_run_status():
    assert derive_thread_status_from_run_status(RunStatus.QUEUED) == "running"
    assert derive_thread_status_from_run_status(RunStatus.RUNNING) == "running"
    assert derive_thread_status_from_run_status(RunStatus.RESUMING) == "running"
    assert derive_thread_status_from_run_status(RunStatus.WAITING_FOR_APPROVAL) == "paused"
    assert derive_thread_status_from_run_status(RunStatus.COMPLETED) == "idle"
    assert derive_thread_status_from_run_status(RunStatus.FAILED) == "idle"


def test_agent_run_status_updates_sync_thread_status(monkeypatch):
    thread = Thread(
        id="thread-1",
        title="demo",
        user_id="user-1",
        agent_type="ai",
        agent_id="sys-default-chat",
        status="idle",
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )
    session = _FakeSession(thread)
    monkeypatch.setattr(settings, "run_deadline_seconds", 30)

    run = create_agent_run(
        session,
        thread_id="thread-1",
        user_id="user-1",
        entrypoint="chat",
        mode="router",
    )
    run.id = "run-1"
    session.runs[run.id] = run
    assert thread.status == "running"
    assert run.deadline_at is not None
    assert int((run.deadline_at - run.started_at).total_seconds()) == 30
    assert [event.event_type for event in session.events[:2]] == [
        RunEventType.RUN_CREATED,
        RunEventType.RUN_STARTED,
    ]

    update_run_status(session, run, RunStatus.WAITING_FOR_APPROVAL, current_node="approval")
    assert thread.status == "paused"

    mark_run_completed(session, run)
    assert thread.status == "idle"


def test_mark_run_failed_syncs_thread_status_to_idle():
    thread = Thread(
        id="thread-1",
        title="demo",
        user_id="user-1",
        agent_type="ai",
        agent_id="sys-default-chat",
        status="running",
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )
    run = AgentRun(
        id="run-1",
        thread_id="thread-1",
        user_id="user-1",
        status=RunStatus.RUNNING,
        created_at=datetime.now(),
        started_at=datetime.now(),
        updated_at=datetime.now(),
    )
    session = _FakeSession(thread)
    session.runs[run.id] = run

    mark_run_failed(session, run, error_message="boom")

    assert run.status == RunStatus.FAILED
    assert thread.status == "idle"


def test_touch_and_timeout_helpers_update_run_and_thread():
    thread = Thread(
        id="thread-1",
        title="demo",
        user_id="user-1",
        agent_type="ai",
        agent_id="sys-default-chat",
        status="running",
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )
    run = AgentRun(
        id="run-1",
        thread_id="thread-1",
        user_id="user-1",
        status=RunStatus.RUNNING,
        current_node="router",
        created_at=datetime.now(),
        started_at=datetime.now(),
        updated_at=datetime.now(),
    )
    session = _FakeSession(thread)
    session.runs[run.id] = run

    touched = touch_run_heartbeat_by_id(session, "run-1", current_node="generic")
    assert touched is not None
    assert touched.current_node == "generic"
    assert touched.last_heartbeat_at is not None

    timed_out = mark_run_timed_out_by_id(session, "run-1", current_node="generic")
    assert timed_out is not None
    assert timed_out.status == RunStatus.TIMED_OUT
    assert timed_out.error_code == ErrorCode.RUN_TIMED_OUT
    assert timed_out.timed_out_at is not None
    assert thread.status == "idle"
    assert session.events[-1].event_type == RunEventType.RUN_TIMED_OUT


def test_mark_run_cancelled_syncs_thread_status_to_idle():
    thread = Thread(
        id="thread-1",
        title="demo",
        user_id="user-1",
        agent_type="ai",
        agent_id="sys-default-chat",
        status="running",
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )
    run = AgentRun(
        id="run-1",
        thread_id="thread-1",
        user_id="user-1",
        status=RunStatus.RUNNING,
        current_node="generic",
        created_at=datetime.now(),
        started_at=datetime.now(),
        updated_at=datetime.now(),
    )
    session = _FakeSession(thread)
    session.runs[run.id] = run

    cancelled = mark_run_cancelled_by_id(session, "run-1", current_node="generic")

    assert cancelled is not None
    assert cancelled.status == RunStatus.CANCELLED
    assert cancelled.error_code == ErrorCode.RUN_CANCELLED
    assert cancelled.cancelled_at is not None
    assert thread.status == "idle"


def test_ensure_no_active_run_for_thread_raises_conflict():
    """有**存活租约**的活跃 run 才挡新任务（决定 2：死活的唯一判据是租约）。"""
    thread = Thread(
        id="thread-1",
        title="demo",
        user_id="user-1",
        agent_type="ai",
        agent_id="sys-default-chat",
        status="running",
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )
    run = AgentRun(
        id="run-1",
        thread_id="thread-1",
        user_id="user-1",
        status=RunStatus.WAITING_FOR_APPROVAL,
        current_node="waiting_for_approval",
        owner=RUN_OWNER_ID,
        lease_expires_at=lease_deadline(),
        created_at=datetime.now(),
        started_at=datetime.now(),
        updated_at=datetime.now(),
    )
    session = _FakeSession(thread)
    session.runs[run.id] = run

    try:
        ensure_no_active_run_for_thread(session, thread_id="thread-1", user_id="user-1")
    except AppError as exc:
        assert exc.code == ErrorCode.ACTIVE_RUN_CONFLICT
        assert exc.status_code == 409
        assert exc.details["active_run_id"] == "run-1"
        assert exc.details["lease_expires_at"], "冲突详情要带上租约到期时刻（排查僵尸时用）"
    else:
        raise AssertionError("Expected active run conflict to be raised")


def test_expired_lease_paused_run_still_holds_thread():
    """停在审批点的 run：租约过期也仍然占着会话（不让新任务插进来）。

    为什么与「过期僵尸让位」相反：HITL 暂停的 run **不是僵尸**——它等的是人，
    这一轮流已收尾没人替它续租，租约必然过期。若互斥照租约把它放行，用户「计划还挂着
    没裁决」时又能发新消息，同一会话就同时有两条 run（一条永远停在审批点）。
    与之配套的回收侧口径见 `run_holds_thread`（回收同样不碰它）。
    """
    thread = Thread(
        id="thread-1",
        title="demo",
        user_id="user-1",
        agent_type="ai",
        agent_id="sys-default-chat",
        status="paused",
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )
    paused = AgentRun(
        id="run-paused",
        thread_id="thread-1",
        user_id="user-1",
        status=RunStatus.WAITING_FOR_APPROVAL,
        current_node="waiting_for_approval",
        owner="dead-process:1234:abcd",
        lease_expires_at=utc_now() - timedelta(hours=1),
        created_at=datetime.now(),
        started_at=datetime.now(),
        updated_at=datetime.now(),
    )
    session = _FakeSession(thread)
    session.runs[paused.id] = paused

    try:
        ensure_no_active_run_for_thread(session, thread_id="thread-1", user_id="user-1")
    except AppError as exc:
        assert exc.code == ErrorCode.ACTIVE_RUN_CONFLICT
        assert exc.details["active_run_id"] == "run-paused"
    else:
        raise AssertionError("停在审批点的 run 必须继续占着会话")


def test_expired_lease_run_does_not_block_new_run():
    """租约过期的活跃 run = 僵尸，不再挡住新任务。

    行为变化（决定 2）：旧口径下这种僵尸要等清理循环「猜」满 30 分钟才放行，
    期间用户一直吃 409；现在过期即可让位，由 supervisor 随后回收。
    """
    thread = Thread(
        id="thread-1",
        title="demo",
        user_id="user-1",
        agent_type="ai",
        agent_id="sys-default-chat",
        status="running",
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )
    zombie = AgentRun(
        id="run-zombie",
        thread_id="thread-1",
        user_id="user-1",
        status=RunStatus.RUNNING,
        current_node="generic",
        owner="dead-process:1234:abcd",
        lease_expires_at=utc_now() - timedelta(seconds=1),
        created_at=datetime.now(),
        started_at=datetime.now(),
        updated_at=datetime.now(),
    )
    homeless = AgentRun(
        id="run-no-lease",
        thread_id="thread-1",
        user_id="user-1",
        status=RunStatus.RUNNING,
        owner=None,
        lease_expires_at=None,  # 迁移前遗留 / 无存活证据
        created_at=datetime.now(),
        started_at=datetime.now(),
        updated_at=datetime.now(),
    )
    session = _FakeSession(thread)
    session.runs[zombie.id] = zombie
    session.runs[homeless.id] = homeless

    # 不抛异常 = 放行
    ensure_no_active_run_for_thread(session, thread_id="thread-1", user_id="user-1")


class _FakePlan:
    """终态收口的计划桩：只承载 status/completed_at/updated_at 三个被写字段。"""

    def __init__(self, status):
        self.status = status
        self.completed_at = None
        self.updated_at = None


def test_terminal_run_closes_stale_plan_and_pending_subtask():
    """run 异常终态必须收口计划与未完结子任务（2026-09-24 僵尸缺口回归钉）。

    曾只收 RUNNING 子任务、不碰 ExecutionPlan——计划挂 waiting_for_approval
    的 run 超时后账面永久"在等审批"，与前端（跟着 run 走）脱节。
    """
    from models.enums import TaskStatus

    thread = Thread(
        id="thread-1",
        title="demo",
        user_id="user-1",
        agent_type="ai",
        agent_id="sys-default-chat",
        status="running",
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )
    run = AgentRun(
        id="run-1",
        thread_id="thread-1",
        user_id="user-1",
        status=RunStatus.RUNNING,
        current_node="router",
        created_at=datetime.now(),
        started_at=datetime.now(),
        updated_at=datetime.now(),
    )
    waiting_plan = _FakePlan(TaskStatus.WAITING_FOR_APPROVAL)
    done_plan = _FakePlan(TaskStatus.COMPLETED)
    session = _FakeSession(thread)
    session.runs[run.id] = run
    session.plans = [waiting_plan, done_plan]

    timed_out = mark_run_timed_out_by_id(session, "run-1")

    assert timed_out is not None
    # 等审批的计划被收口为 failed；已完结的计划不动
    assert waiting_plan.status == TaskStatus.FAILED
    assert waiting_plan.completed_at is not None
    assert done_plan.status == TaskStatus.COMPLETED


def test_cancelled_run_closes_stale_plan_as_cancelled():
    from models.enums import TaskStatus

    thread = Thread(
        id="thread-1",
        title="demo",
        user_id="user-1",
        agent_type="ai",
        agent_id="sys-default-chat",
        status="running",
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )
    run = AgentRun(
        id="run-1",
        thread_id="thread-1",
        user_id="user-1",
        status=RunStatus.RUNNING,
        current_node="router",
        created_at=datetime.now(),
        started_at=datetime.now(),
        updated_at=datetime.now(),
    )
    running_plan = _FakePlan(TaskStatus.RUNNING)
    session = _FakeSession(thread)
    session.runs[run.id] = run
    session.plans = [running_plan]

    cancelled = mark_run_cancelled_by_id(session, "run-1")

    assert cancelled is not None
    assert running_plan.status == TaskStatus.CANCELLED


def test_mark_run_completed_closes_stale_plan_defensively():
    """完成路径的防御性收口：正常应为无操作，但漏网的未终态计划按 completed 收。"""
    from models.enums import TaskStatus

    thread = Thread(
        id="thread-1",
        title="demo",
        user_id="user-1",
        agent_type="ai",
        agent_id="sys-default-chat",
        status="running",
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )
    run = AgentRun(
        id="run-1",
        thread_id="thread-1",
        user_id="user-1",
        status=RunStatus.RUNNING,
        current_node="aggregator",
        created_at=datetime.now(),
        started_at=datetime.now(),
        updated_at=datetime.now(),
    )
    stale_plan = _FakePlan(TaskStatus.WAITING_FOR_APPROVAL)
    session = _FakeSession(thread)
    session.runs[run.id] = run
    session.plans = [stale_plan]

    mark_run_completed(session, run)

    assert run.status == RunStatus.COMPLETED
    assert stale_plan.status == TaskStatus.COMPLETED
    assert stale_plan.completed_at is not None
