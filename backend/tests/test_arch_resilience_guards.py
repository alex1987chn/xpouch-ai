import asyncio
import sys
from pathlib import Path

from langchain_core.messages import ToolMessage

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from agents.graph import _should_trip_tool_loop_guard  # noqa: E402
from agents.state_patch import EVENT_QUEUE_MAX_SIZE, append_sse_event, append_sse_events  # noqa: E402
from services.mcp_tools_service import MCPToolsService  # noqa: E402
from utils.error_codes import ErrorCode, as_error_code  # noqa: E402
from utils.exceptions import AppError  # noqa: E402


def test_event_queue_is_capped_to_prevent_growth():
    queue = []
    for idx in range(EVENT_QUEUE_MAX_SIZE + 25):
        queue = append_sse_event(queue, f"e-{idx}")

    assert len(queue) == EVENT_QUEUE_MAX_SIZE
    assert queue[0]["event"] == "e-25"
    assert queue[-1]["event"] == f"e-{EVENT_QUEUE_MAX_SIZE + 24}"


def test_tool_loop_guard_detects_same_tool_streak():
    msgs = [
        ToolMessage(content="ok", tool_call_id=f"id-{idx}", name="search_web")
        for idx in range(5)
    ]
    tripped, reason = _should_trip_tool_loop_guard(msgs)
    assert tripped is True
    assert "连续调用" in reason


def test_error_code_enum_is_serialized_consistently():
    err = AppError(message="冲突", code=ErrorCode.PLAN_VERSION_CONFLICT, status_code=409)
    assert err.code == "PLAN_VERSION_CONFLICT"
    assert as_error_code(ErrorCode.RESUME_IN_PROGRESS) == "RESUME_IN_PROGRESS"


def test_mcp_tools_service_singleflight_reuses_same_inflight(monkeypatch):
    service = MCPToolsService()
    call_count = 0

    async def _fake_load_tools():
        nonlocal call_count
        call_count += 1
        await asyncio.sleep(0.02)
        return ["tool-a"]

    monkeypatch.setattr(service, "_load_tools", _fake_load_tools)

    async def _run():
        results = await asyncio.gather(*(service.get_tools() for _ in range(6)))
        return results

    results = asyncio.run(_run())
    assert call_count == 1
    assert all(result == ["tool-a"] for result in results)


def test_append_sse_events_capped_when_batch_append():
    queue = append_sse_events([], [f"b-{idx}" for idx in range(EVENT_QUEUE_MAX_SIZE + 10)])
    assert len(queue) == EVENT_QUEUE_MAX_SIZE
    assert queue[0]["event"] == "b-10"
