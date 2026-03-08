import pytest

from models import AgentRun, RunEvent, RunEventType, Thread
from routers import runs
from utils.exceptions import AuthorizationError, NotFoundError


class _FakeSession:
    def __init__(self, *, runs_by_id=None, threads_by_id=None):
        self._runs_by_id = runs_by_id or {}
        self._threads_by_id = threads_by_id or {}

    def get(self, model, object_id):
        if model is AgentRun:
            return self._runs_by_id.get(object_id)
        if model is Thread:
            return self._threads_by_id.get(object_id)
        return None


@pytest.mark.asyncio
async def test_get_run_timeline_requires_run_ownership(sample_user, monkeypatch):
    db = _FakeSession(
        runs_by_id={
            "run-1": AgentRun(
                id="run-1",
                thread_id="thread-1",
                user_id="other-user",
                entrypoint="chat",
                mode="complex",
            )
        }
    )

    monkeypatch.setattr(runs, "get_run_events_by_run_id", lambda *_args, **_kwargs: [])

    with pytest.raises(AuthorizationError, match="无权访问此运行实例"):
        await runs.get_run_timeline(
            run_id="run-1",
            limit=100,
            offset=0,
            db=db,
            current_user=sample_user,
        )


@pytest.mark.asyncio
async def test_get_run_timeline_returns_events_for_owner(sample_user, monkeypatch):
    db = _FakeSession(
        runs_by_id={
            "run-1": AgentRun(
                id="run-1",
                thread_id="thread-1",
                user_id=sample_user.id,
                entrypoint="chat",
                mode="complex",
            )
        }
    )
    events = [
        RunEvent(
            id=1,
            run_id="run-1",
            event_type=RunEventType.RUN_CREATED,
            thread_id="thread-1",
        )
    ]

    monkeypatch.setattr(runs, "get_run_events_by_run_id", lambda *_args, **_kwargs: events)

    response = await runs.get_run_timeline(
        run_id="run-1",
        limit=100,
        offset=0,
        db=db,
        current_user=sample_user,
    )

    assert response.run_id == "run-1"
    assert response.total == 1
    assert response.events[0].event_type == RunEventType.RUN_CREATED


@pytest.mark.asyncio
async def test_get_thread_timeline_requires_thread_ownership(sample_user, monkeypatch):
    db = _FakeSession(
        threads_by_id={
            "thread-1": Thread(
                id="thread-1",
                title="test",
                user_id="other-user",
            )
        }
    )

    monkeypatch.setattr(runs, "get_run_events_by_thread_id", lambda *_args, **_kwargs: [])

    with pytest.raises(AuthorizationError, match="无权访问此线程"):
        await runs.get_thread_timeline(
            thread_id="thread-1",
            limit=200,
            offset=0,
            db=db,
            current_user=sample_user,
        )


@pytest.mark.asyncio
async def test_get_run_timeline_raises_not_found(sample_user, monkeypatch):
    db = _FakeSession()

    monkeypatch.setattr(runs, "get_run_events_by_run_id", lambda *_args, **_kwargs: [])

    with pytest.raises(NotFoundError, match="AgentRun"):
        await runs.get_run_timeline(
            run_id="missing-run",
            limit=100,
            offset=0,
            db=db,
            current_user=sample_user,
        )
