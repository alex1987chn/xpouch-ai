from datetime import datetime

from langchain_core.messages import AIMessage, HumanMessage

from models import ExecutionPlan
from services.chat.stream_service import StreamService


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


# 已移除的用例（批次 B3）：
# - test_hitl_wait_guard_* 测的是 _should_wait_for_human_approval 启发式，
#   该启发式已删除——暂停判据改为图的原生 interrupt（见 stream_service
#   的 pending_interrupts 检测与 agents/nodes/plan_approval.py）。
# - test_loop_budget_guard_* 测的是 _raise_if_loop_budget_exhausted，该守卫
#   随外层 while 循环一并删除，循环保护改由原生 recursion_limit 承担。
# 上述不变量改由图结构保证，见 tests/test_graph_topology.py。
