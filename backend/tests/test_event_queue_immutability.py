from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]


def _read(path: str) -> str:
    return (BACKEND_ROOT / path).read_text(encoding="utf-8")


def test_router_uses_immutable_event_queue_update():
    code = _read("agents/nodes/router.py")
    assert 'base_event_queue = state.get("event_queue", [])' in code
    assert "full_event_queue = [" in code
    assert "event_queue.append(" not in code


def test_aggregator_uses_immutable_event_queue_update():
    code = _read("agents/nodes/aggregator.py")
    assert 'base_event_queue = state.get("event_queue", [])' in code
    assert "delta_events = []" in code
    assert "full_event_queue = [" in code
    assert "event_queue.append(" not in code


def test_generic_uses_immutable_state_updates():
    code = _read("agents/nodes/generic.py")
    assert "started_event_entry" in code
    assert "updated_task_list = [" in code
    assert "failed_task_list = [" in code
    assert "initial_event_queue.append(" not in code
