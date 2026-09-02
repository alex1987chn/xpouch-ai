"""用户偏好设置领域模型"""

from datetime import datetime

from sqlalchemy import JSON, Column, func
from sqlmodel import Field, SQLModel


class UserSettings(SQLModel, table=True):
    """用户级偏好设置。

    preferences 使用 JSON 弹性字段，新增偏好项无需迁移：
    v1 结构 {"simple_model": str | null, "simple_thinking": "auto" | "enabled" | "disabled"}
    （simple_model 为 null 表示跟随系统默认模型）
    """

    __tablename__ = "user_settings"

    user_id: str = Field(primary_key=True, foreign_key="user.id")
    preferences: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    updated_at: datetime = Field(
        default_factory=datetime.now,
        sa_column_kwargs={"onupdate": func.now()},
    )
