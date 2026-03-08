from datetime import datetime

from config import settings
from crud.agent_run import (
    create_agent_run,
    derive_thread_status_from_run_status,
    mark_run_cancelled_by_id,
    mark_run_completed,
    mark_run_failed,
    mark_run_timed_out_by_id,
    touch_run_heartbeat_by_id,
    update_run_status,
)
from models import AgentRun, RunEvent, RunEventType, RunStatus, Thread
from utils.error_codes import ErrorCode


class _FakeSession:
    def __init__(self, thread: Thread):
        self.thread = thread
        self.runs: dict[str, AgentRun] = {}
        self.events: list[RunEvent] = []
        self.commit_called = False

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
        self.commit_called = True

    def get(self, model, object_id):
        if model is Thread and object_id == self.thread.id:
            return self.thread
        if model is AgentRun:
            return self.runs.get(object_id)
        return None


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
