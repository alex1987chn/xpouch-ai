from datetime import datetime

import pytest
from langchain_core.messages import AIMessage, HumanMessage

from models import ExecutionPlan
from services.chat.stream_service import StreamService
from utils.error_codes import ErrorCode
from utils.exceptions import AppError


class _DummySession:
    pass


def test_complex_persistence_guard_rejects_non_ai_message(monkeypatch):
    service = StreamService(_DummySession())
    execution_plan = ExecutionPlan(
        id="plan-1",
        thread_id="thread-1",
        user_query="query",
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )
    monkeypatch.setattr(service, "_get_latest_execution_plan", lambda _thread_id: execution_plan)

    error = service._get_complex_result_persistence_error(
        thread_id="thread-1",
        last_message=HumanMessage(content="user message"),
        task_list=[{"id": "task-1"}],
    )

    assert error == "复杂模式未产出有效助手消息，已拒绝将当前结果落库为 completed"


def test_complex_persistence_guard_rejects_missing_task_results(monkeypatch):
    service = StreamService(_DummySession())
    execution_plan = ExecutionPlan(
        id="plan-1",
        thread_id="thread-1",
        user_query="query",
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )
    monkeypatch.setattr(service, "_get_latest_execution_plan", lambda _thread_id: execution_plan)

    error = service._get_complex_result_persistence_error(
        thread_id="thread-1",
        last_message=AIMessage(content="assistant message"),
        task_list=[],
    )

    assert error == "复杂模式未收集到任何任务结果，已拒绝将当前结果落库为 completed"


def test_complex_persistence_guard_accepts_valid_result(monkeypatch):
    service = StreamService(_DummySession())
    execution_plan = ExecutionPlan(
        id="plan-1",
        thread_id="thread-1",
        user_query="query",
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )
    monkeypatch.setattr(service, "_get_latest_execution_plan", lambda _thread_id: execution_plan)

    error = service._get_complex_result_persistence_error(
        thread_id="thread-1",
        last_message=AIMessage(content="assistant message"),
        task_list=[{"id": "task-1"}],
    )

    assert error is None


def test_hitl_wait_guard_requires_plan_before_task_execution():
    service = StreamService(_DummySession())

    should_wait = service._should_wait_for_human_approval(
        task_list=[{"id": "task-1"}],
        current_task_index=0,
        collected_task_list=[],
    )

    assert should_wait is True


def test_hitl_wait_guard_stops_after_task_execution_started():
    service = StreamService(_DummySession())

    should_wait = service._should_wait_for_human_approval(
        task_list=[{"id": "task-1"}],
        current_task_index=0,
        collected_task_list=[{"id": "task-1"}],
    )

    assert should_wait is False


def test_loop_budget_guard_raises_when_budget_exhausted():
    service = StreamService(_DummySession())

    with pytest.raises(AppError) as exc_info:
        service._raise_if_loop_budget_exhausted(
            loop_count=5,
            max_loops=5,
            aggregator_executed=False,
            run_id=None,
        )

    assert exc_info.value.code == ErrorCode.LOOP_GUARD_TRIGGERED


def test_loop_budget_guard_skips_when_aggregator_finished():
    service = StreamService(_DummySession())

    service._raise_if_loop_budget_exhausted(
        loop_count=5,
        max_loops=5,
        aggregator_executed=True,
        run_id=None,
    )
