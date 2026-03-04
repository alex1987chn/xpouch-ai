"""
会话相关 DTO
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class MessageResponse(BaseModel):
    """消息响应模型"""

    id: int | None = None
    role: str
    content: str
    timestamp: datetime | None = None
    extra_data: dict | None = None

    model_config = ConfigDict(from_attributes=True)


class ThreadListResponse(BaseModel):
    """会话列表响应模型（轻量级，不包含消息内容）"""

    id: str | None = None
    title: str
    agent_type: str
    agent_id: str
    user_id: str
    task_session_id: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    message_count: int = 0  # 消息数量，替代完整消息列表
    last_message_preview: str | None = None  # 最后一条消息的预览（前100字）

    model_config = ConfigDict(from_attributes=True)


class ThreadDetailResponse(BaseModel):
    """会话详情响应模型（完整数据，包含所有消息）"""

    id: str | None = None
    title: str
    agent_type: str
    agent_id: str
    user_id: str
    task_session_id: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    messages: list[MessageResponse] = []
    task_session: dict | None = None  # 复杂模式下的任务会话数据

    model_config = ConfigDict(from_attributes=True)


class PaginatedThreadListResponse(BaseModel):
    """分页会话列表响应模型"""

    items: list[ThreadListResponse]  # 当前页数据
    total: int  # 总记录数
    page: int  # 当前页码
    limit: int  # 每页条数
    pages: int  # 总页数

    model_config = ConfigDict(from_attributes=True)
