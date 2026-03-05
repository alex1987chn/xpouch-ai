"""
自定义智能体相关 DTO
"""

from datetime import datetime

from pydantic import BaseModel
from pydantic import Field as PydanticField


class CustomAgentCreate(BaseModel):
    """创建自定义智能体的 DTO"""

    name: str
    description: str | None = None
    system_prompt: str = PydanticField(alias="systemPrompt")  # 必填，前端字段为 systemPrompt
    category: str = "综合"
    model_id: str = PydanticField(default="deepseek-chat", alias="modelId")


class CustomAgentUpdate(BaseModel):
    """更新自定义智能体的 DTO"""

    name: str | None = None
    description: str | None = None
    system_prompt: str | None = PydanticField(default=None, alias="systemPrompt")
    category: str | None = None
    model_id: str | None = PydanticField(default=None, alias="modelId")


class CustomAgentResponse(BaseModel):
    """自定义智能体响应 DTO"""

    id: str
    user_id: str
    name: str
    description: str | None = None
    system_prompt: str
    model_id: str
    is_default: bool
    category: str
    is_public: bool
    conversation_count: int
    created_at: datetime
    updated_at: datetime
