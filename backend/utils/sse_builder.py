"""
SSE 事件构建工具。

目标：
- 统一 message/error/human-interrupt/heartbeat 的构建逻辑
- 避免多个 service 重复手写 build_sse_event + sse_event_to_string
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime

from event_types.events import (
    ErrorData,
    EventType,
    HumanInterruptData,
    MessageDeltaData,
    MessageDoneData,
    build_sse_event,
)
from utils.error_codes import ErrorCode, as_error_code
from utils.event_generator import sse_event_to_string


def build_message_delta_event(message_id: str, content: str) -> str:
    event = build_sse_event(
        EventType.MESSAGE_DELTA,
        MessageDeltaData(message_id=message_id, content=content),
        str(uuid.uuid4()),
    )
    return sse_event_to_string(event)


def build_message_done_event(message_id: str, content: str) -> str:
    event = build_sse_event(
        EventType.MESSAGE_DONE,
        MessageDoneData(message_id=message_id, full_content=content),
        str(uuid.uuid4()),
    )
    return sse_event_to_string(event)


def build_error_event(code: str | ErrorCode, message: str) -> str:
    event = build_sse_event(
        EventType.ERROR,
        ErrorData(code=as_error_code(code), message=message),
        str(uuid.uuid4()),
    )
    return sse_event_to_string(event)


def build_human_interrupt_event(
    thread_id: str,
    current_plan: list[dict],
    plan_version: int,
) -> str:
    event = build_sse_event(
        EventType.HUMAN_INTERRUPT,
        HumanInterruptData(
            type="plan_review",
            current_plan=current_plan,
            plan_version=plan_version,
        ),
        str(uuid.uuid4()),
    )
    return sse_event_to_string(event)


def build_heartbeat_event() -> str:
    return f"event: heartbeat\ndata: {json.dumps({'ts': datetime.now().isoformat()})}\n\n"
