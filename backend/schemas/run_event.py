"""
RunEvent 相关的 Pydantic DTO
"""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict

from models.enums import RunEventType


class RunEventResponse(BaseModel):
    """运行事件响应"""

    model_config = ConfigDict(from_attributes=True)

    id: int
    run_id: str
    event_type: RunEventType
    timestamp: datetime
    event_data: dict[str, Any] | None = None
    thread_id: str | None = None
    execution_plan_id: str | None = None
    task_id: str | None = None
    note: str | None = None


class RunTimelineResponse(BaseModel):
    """运行时间线响应"""

    run_id: str
    events: list[RunEventResponse]
    total: int


class ThreadTimelineResponse(BaseModel):
    """线程时间线响应（包含所有运行的事件）"""

    thread_id: str
    events: list[RunEventResponse]
    total: int
