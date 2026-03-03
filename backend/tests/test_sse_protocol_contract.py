import re
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
FRONTEND_ROOT = REPO_ROOT / "frontend"

if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from event_types.events import EventType  # noqa: E402


def _extract_frontend_event_types() -> set[str]:
    content = (FRONTEND_ROOT / "src/types/events.ts").read_text(encoding="utf-8")
    event_type_block = re.search(
        r"export type EventType\s*=\s*(.*?)(?:\n\s*//\s*=+)",
        content,
        flags=re.DOTALL,
    )
    assert event_type_block is not None, "frontend EventType 定义块未找到"

    return {
        match.group(1)
        for match in re.finditer(r"\|\s*'([^']+)'", event_type_block.group(1))
    }


def _extract_frontend_handled_event_types() -> set[str]:
    content = (FRONTEND_ROOT / "src/handlers/index.ts").read_text(encoding="utf-8")
    return {match.group(1) for match in re.finditer(r"case\s+'([^']+)':", content)}


def test_backend_and_frontend_event_types_are_consistent():
    backend_event_types = {event_type.value for event_type in EventType}
    frontend_event_types = _extract_frontend_event_types()
    assert backend_event_types == frontend_event_types


def test_event_handler_switch_covers_all_event_types():
    frontend_event_types = _extract_frontend_event_types()
    handled_event_types = _extract_frontend_handled_event_types()
    assert handled_event_types == frontend_event_types
