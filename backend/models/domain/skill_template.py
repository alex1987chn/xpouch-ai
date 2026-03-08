"""
Skill / Template 领域模型
"""

from datetime import datetime

from sqlalchemy import JSON, Column, Index, String, func
from sqlmodel import Field, SQLModel


class SkillTemplate(SQLModel, table=True):
    """可复用技能/模板。"""

    __table_args__ = (Index("idx_skilltemplate_template_key", "template_key", unique=True),)

    __tablename__ = "skilltemplate"

    id: str = Field(default_factory=lambda: str(__import__("uuid").uuid4()), primary_key=True)
    template_key: str = Field(max_length=128, description="模板唯一标识")
    name: str = Field(max_length=255, description="模板名称")
    description: str | None = Field(default=None, description="模板描述")
    category: str = Field(
        default="general",
        sa_column=Column(String(64), nullable=False, index=True),
    )
    starter_prompt: str = Field(description="点击使用后注入聊天入口的默认提示")
    system_hint: str | None = Field(default=None, description="模板系统说明")
    recommended_mode: str = Field(
        default="complex",
        sa_column=Column(String(32), nullable=False, index=True),
        description="推荐运行模式：simple / complex",
    )
    suggested_tags: list[str] | None = Field(default=None, sa_column=Column(JSON))
    tool_hints: list[str] | None = Field(default=None, sa_column=Column(JSON))
    is_active: bool = Field(default=True)
    is_builtin: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(
        default_factory=datetime.now,
        sa_column_kwargs={"onupdate": func.now()},
    )
