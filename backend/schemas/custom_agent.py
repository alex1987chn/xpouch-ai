"""
自定义智能体相关 DTO
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict
from pydantic import Field as PydanticField


class CustomAgentCreate(BaseModel):
    """创建自定义智能体的 DTO"""

    name: str
    description: str | None = None
    system_prompt: str = PydanticField(alias="systemPrompt")  # 必填，前端字段为 systemPrompt
    category: str = "综合"
    model_id: str = PydanticField(default="deepseek-flash", alias="modelId")


class CustomAgentUpdate(BaseModel):
    """更新自定义智能体的 DTO"""

    name: str | None = None
    description: str | None = None
    system_prompt: str | None = PydanticField(default=None, alias="systemPrompt")
    category: str | None = None
    model_id: str | None = PydanticField(default=None, alias="modelId")


class CustomAgentResponse(BaseModel):
    """自定义智能体响应 DTO（from_attributes：路由直返 CustomAgent ORM）"""

    model_config = ConfigDict(from_attributes=True)

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


class AgentSummaryResponse(BaseModel):
    """自定义智能体列表项（AgentService.list_custom_agents 手工组装的扁平条目；

    与 CustomAgentResponse 的差异：时间字段在 service 里已 isoformat 成字符串，
    另带列表专用的 is_builtin 常量位——两个形态并存是既有契约，不在此合并。
    """

    id: str
    name: str
    description: str
    system_prompt: str
    category: str
    model_id: str
    conversation_count: int
    is_public: bool
    is_default: bool
    is_builtin: bool
    created_at: str | None = None
    updated_at: str | None = None
