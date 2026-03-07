"""
会话相关 DTO
"""

import json
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, field_validator


class MessageResponse(BaseModel):
    """消息响应模型"""

    id: int | None = None
    role: str
    content: str
    timestamp: datetime | None = None
    extra_data: dict | None = None

    model_config = ConfigDict(from_attributes=True)

    @field_validator("extra_data", mode="before")
    @classmethod
    def parse_extra_data(cls, v: Any) -> dict | None:
        """兼容字符串格式的 JSON 数据"""
        if v is None:
            return None
        if isinstance(v, dict):
            return v
        if isinstance(v, str):
            if v == "null":
                return None
            try:
                return json.loads(v)
            except json.JSONDecodeError:
                return None
        return None


class ThreadListResponse(BaseModel):
    """会话列表响应模型（轻量级，不包含消息内容）"""

    id: str | None = None
    title: str
    agent_type: str
    agent_id: str
    user_id: str
    execution_plan_id: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    message_count: int = 0  # 消息数量，替代完整消息列表
    last_message_preview: str | None = None  # 最后一条消息的预览（前100字）

    model_config = ConfigDict(from_attributes=True)


class AgentRunSummaryResponse(BaseModel):
    """线程详情中的最近一次运行摘要。"""

    id: str
    status: str
    current_node: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    last_heartbeat_at: datetime | None = None
    completed_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class ThreadDetailResponse(BaseModel):
    """会话详情响应模型（完整数据，包含所有消息）"""

    id: str | None = None
    title: str
    agent_type: str
    agent_id: str
    user_id: str
    execution_plan_id: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    messages: list[MessageResponse] = []
    execution_plan: dict | None = None  # 复杂模式下的执行计划数据
    latest_run: AgentRunSummaryResponse | None = None

    model_config = ConfigDict(from_attributes=True)


class PaginatedThreadListResponse(BaseModel):
    """分页会话列表响应模型"""

    items: list[ThreadListResponse]  # 当前页数据
    total: int  # 总记录数
    page: int  # 当前页码
    limit: int  # 每页条数
    pages: int  # 总页数

    model_config = ConfigDict(from_attributes=True)
