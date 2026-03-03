import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from agents.state_patch import append_sse_event, append_sse_events, replace_task_item  # noqa: E402


def _read(path: str) -> str:
    return (BACKEND_ROOT / path).read_text(encoding="utf-8")


def test_router_uses_immutable_event_queue_update():
    code = _read("agents/nodes/router.py")
    assert "get_event_queue_snapshot(state)" in code
    assert "append_sse_event(" in code
    assert "event_queue.append(" not in code


def test_aggregator_uses_immutable_event_queue_update():
    code = _read("agents/nodes/aggregator.py")
    assert "get_event_queue_snapshot(state)" in code
    assert "append_sse_events(" in code
    assert "append_sse_event(" in code
    assert "event_queue.append(" not in code


def test_generic_uses_immutable_state_updates():
    code = _read("agents/nodes/generic.py")
    assert "replace_task_item(" in code
    assert "append_sse_event(" in code
    assert "get_event_queue_snapshot(state)" in code
    assert "initial_event_queue.append(" not in code


def test_commander_uses_immutable_event_queue_updates():
    code = _read("agents/nodes/commander.py")
    assert "get_event_queue_snapshot(state)" in code
    assert "append_sse_event(" in code
    assert "commander_response, event_queue = await _generate_plan_with_json_mode(" in code
    assert "event_queue.append(" not in code


def test_replace_task_item_returns_new_list_and_merges_fields():
    task_list = [
        {"id": "t1", "status": "pending", "meta": {"a": 1}},
        {"id": "t2", "status": "pending"},
    ]
    updated = replace_task_item(task_list, 0, {"status": "completed"})

    assert updated is not task_list
    assert updated[0]["id"] == "t1"
    assert updated[0]["status"] == "completed"
    assert task_list[0]["status"] == "pending"


def test_append_sse_event_helpers_are_immutable():
    base_queue = [{"type": "sse", "event": "seed"}]
    with_one = append_sse_event(base_queue, "e1")
    with_many = append_sse_events(with_one, ["e2", "e3"])

    assert base_queue == [{"type": "sse", "event": "seed"}]
    assert with_one != base_queue
    assert [item["event"] for item in with_many] == ["seed", "e1", "e2", "e3"]
