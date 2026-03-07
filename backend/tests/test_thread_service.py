from datetime import datetime

import pytest

from models import AgentRun, ExecutionPlan, RunStatus, Thread
from services.chat.thread_service import ChatThreadService


class _ExecResult:
    def __init__(self, first_value=None, all_value=None):
        self._first_value = first_value
        self._all_value = all_value if all_value is not None else []

    def first(self):
        return self._first_value

    def all(self):
        return self._all_value


class _FakeThreadSession:
    def __init__(self, thread: Thread, execution_plans=None, agent_runs=None):
        self.thread = thread
        self.execution_plans = execution_plans or []
        self.agent_runs = agent_runs or []
        self.deleted = []
        self.flush_called = False
        self.commit_called = False
        self._exec_calls = 0

    def get(self, model, object_id):
        if model is Thread and object_id == self.thread.id:
            return self.thread
        if model is ExecutionPlan:
            for execution_plan in self.execution_plans:
                if execution_plan.id == object_id:
                    return execution_plan
        return None

    def exec(self, _statement):
        statement_text = str(_statement)
        if "FROM thread" in statement_text:
            return _ExecResult(first_value=self.thread)
        if "FROM executionplan" in statement_text:
            return _ExecResult(all_value=self.execution_plans)
        if "FROM agentrun" in statement_text:
            latest_run = self.agent_runs[0] if self.agent_runs else None
            return _ExecResult(first_value=latest_run, all_value=self.agent_runs)
        return _ExecResult()

    def add(self, _obj):
        return None

    def flush(self):
        self.flush_called = True

    def delete(self, obj):
        self.deleted.append(obj)

    def commit(self):
        self.commit_called = True


@pytest.mark.asyncio
async def test_get_thread_detail_prefers_execution_plan_id_over_agent_type(monkeypatch):
    thread = Thread(
        id="thread-1",
        title="history",
        user_id="user-1",
        agent_type="default",
        agent_id="sys-default-chat",
        execution_plan_id="plan-1",
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )
    session = _FakeThreadSession(thread)
    service = ChatThreadService(session)

    async def _fake_complex_response(self, input_thread):
        assert input_thread is thread
        return {"mode": "complex"}

    monkeypatch.setattr(
        ChatThreadService,
        "_build_complex_thread_response",
        _fake_complex_response,
    )
    monkeypatch.setattr(
        ChatThreadService,
        "_build_simple_thread_response",
        lambda self, _thread: {"mode": "simple"},
    )

    result = await service.get_thread_detail("thread-1", "user-1")

    assert result == {"mode": "complex"}


@pytest.mark.asyncio
async def test_delete_thread_removes_execution_plans_and_runs_in_safe_order():
    thread = Thread(
        id="thread-1",
        title="to-delete",
        user_id="user-1",
        agent_type="ai",
        agent_id="sys-default-chat",
        execution_plan_id="plan-1",
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )
    execution_plan = ExecutionPlan(
        id="plan-1",
        thread_id="thread-1",
        run_id="run-1",
        user_query="hello",
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )
    agent_run = AgentRun(
        id="run-1",
        thread_id="thread-1",
        user_id="user-1",
        created_at=datetime.now(),
        started_at=datetime.now(),
        updated_at=datetime.now(),
    )
    session = _FakeThreadSession(thread, execution_plans=[execution_plan], agent_runs=[agent_run])
    service = ChatThreadService(session)

    result = await service.delete_thread("thread-1", "user-1")

    assert result is True
    assert thread.execution_plan_id is None
    assert session.flush_called is True
    assert session.commit_called is True
    assert session.deleted == [execution_plan, agent_run, thread]


def test_build_simple_thread_response_includes_latest_run_summary():
    thread = Thread(
        id="thread-1",
        title="history",
        user_id="user-1",
        agent_type="ai",
        agent_id="sys-default-chat",
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )
    agent_run = AgentRun(
        id="run-1",
        thread_id="thread-1",
        user_id="user-1",
        status=RunStatus.WAITING_FOR_APPROVAL,
        current_node="waiting_for_approval",
        created_at=datetime.now(),
        started_at=datetime.now(),
        updated_at=datetime.now(),
    )
    session = _FakeThreadSession(thread, agent_runs=[agent_run])
    service = ChatThreadService(session)

    response = service._build_simple_thread_response(thread)

    assert response["latest_run"]["id"] == "run-1"
    assert response["latest_run"]["status"] == "waiting_for_approval"
    assert response["latest_run"]["current_node"] == "waiting_for_approval"
