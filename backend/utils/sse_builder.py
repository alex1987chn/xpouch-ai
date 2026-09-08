"""
SSE 事件构建工具——传输层事件（message.*/error/human.interrupt/heartbeat）的便捷层。

分层职责（单一格式管线）：
- event_types.events.build_sse_event + utils.event_generator.sse_event_to_string
  是唯一的 SSE 对象格式管线（所有事件共用）；
- 本模块为流式生成器场景提供 message.*/error/human.interrupt 的直接字符串
  构建便捷函数（事件家族划分，非第二套格式）；
- plan.*/task.*/artifact.* 业务事件的 SSEEvent 对象由 utils/event_generator
  的 event_* 工厂构建（emit_event 通道）；
- heartbeat 是纯传输保活，刻意不走 pydantic 模型。
"""

from __future__ import annotations

import json
import uuid

from event_types.events import (
    ErrorData,
    EventType,
    HumanInterruptData,
    MessageDeltaData,
    MessageDoneData,
    MessageThinkingData,
    build_sse_event,
)
from utils.error_codes import ErrorCode, as_error_code
from utils.event_generator import sse_event_to_string
from utils.time import utc_now_naive


def build_message_delta_event(message_id: str, content: str) -> str:
    event = build_sse_event(
        EventType.MESSAGE_DELTA,
        MessageDeltaData(message_id=message_id, content=content),
        str(uuid.uuid4()),
    )
    return sse_event_to_string(event)


def build_message_thinking_event(message_id: str, content: str) -> str:
    event = build_sse_event(
        EventType.MESSAGE_THINKING,
        MessageThinkingData(message_id=message_id, content=content),
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
    run_id: str | None = None,
    execution_plan_id: str | None = None,
) -> str:
    event = build_sse_event(
        EventType.HUMAN_INTERRUPT,
        HumanInterruptData(
            type="plan_review",
            run_id=run_id,
            execution_plan_id=execution_plan_id,
            current_plan=current_plan,
            plan_version=plan_version,
        ),
        str(uuid.uuid4()),
    )
    return sse_event_to_string(event)


def build_heartbeat_event() -> str:
    return f"event: heartbeat\ndata: {json.dumps({'ts': utc_now_naive().isoformat()})}\n\n"
