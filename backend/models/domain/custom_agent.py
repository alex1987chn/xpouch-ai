"""
自定义智能体领域模型

包含：
- CustomAgent: 用户自定义智能体表
"""

from datetime import datetime
from typing import Optional

from sqlalchemy import func
from sqlmodel import Field, Relationship, SQLModel


class CustomAgent(SQLModel, table=True):
    """
    用户智能体（包括默认助手和自定义智能体）

    用于简单的对话场景，直接使用用户的 system_prompt 调用 LLM，
    不经过 LangGraph 的专家工作流。
    """

    __tablename__ = "customagent"

    id: str = Field(
        default_factory=lambda: __import__("uuid").uuid4(),
        primary_key=True,
    )

    # 关联用户
    user_id: str = Field(foreign_key="user.id", index=True, max_length=64)

    # 基本信息
    name: str = Field(index=True, max_length=255)  # 智能体名称
    description: str | None = None  # 描述

    # 核心配置
    system_prompt: str  # 用户自定义的系统提示词（关键！）
    model_id: str = Field(
        default="deepseek-chat", max_length=128
    )  # 使用的模型

    # 新增：是否为默认助手
    is_default: bool = Field(default=False, index=True)

    # 分类和统计
    category: str = Field(
        default="综合", max_length=64
    )  # 分类（写作、编程、创意等）
    is_public: bool = Field(default=False)  # 是否公开（未来扩展）
    conversation_count: int = Field(default=0)  # 使用次数

    # 时间戳
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(
        default_factory=datetime.now,
        sa_column_kwargs={"onupdate": func.now()},
    )

    # 关联关系（使用字符串避免循环导入）
    user: Optional["User"] = Relationship(back_populates="custom_agents")  # noqa: F821
