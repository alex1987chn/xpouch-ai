from datetime import datetime, timedelta

import pytest

from models import AgentRun, RunStatus
from services.chat.stream_service import StreamService
from utils.error_codes import ErrorCode
from utils.exceptions import AppError


class _FakeSession:
    def __init__(self, run: AgentRun):
        self.run = run
        self.commit_called = False

    def get(self, model, object_id):
        if model is AgentRun and object_id == self.run.id:
            return self.run
        return None

    def add(self, obj):
        if isinstance(obj, AgentRun):
            self.run = obj

    def commit(self):
        self.commit_called = True


def test_deadline_guard_marks_run_timed_out():
    run = AgentRun(
        id="run-1",
        thread_id="thread-1",
        user_id="user-1",
        status=RunStatus.RUNNING,
        current_node="generic",
        deadline_at=datetime.now() - timedelta(seconds=1),
        created_at=datetime.now(),
        started_at=datetime.now(),
        updated_at=datetime.now(),
    )
    session = _FakeSession(run)
    service = StreamService(session)

    with pytest.raises(AppError) as exc_info:
        service._raise_if_run_cancelled("run-1")

    assert exc_info.value.code == ErrorCode.RUN_TIMED_OUT
    assert run.status == RunStatus.TIMED_OUT
    assert run.error_code == ErrorCode.RUN_TIMED_OUT
    assert run.timed_out_at is not None
    assert session.commit_called is True
