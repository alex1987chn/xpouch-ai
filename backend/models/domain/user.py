"""
用户领域模型

包含：
- User: 用户表
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Column, func
from sqlalchemy import Enum as SAEnum
from sqlmodel import Field, Relationship, SQLModel

from models.enums import UserRole, _enum_values

if TYPE_CHECKING:
    from models.domain.custom_agent import CustomAgent
    from models.domain.thread import Thread


class User(SQLModel, table=True):
    """用户表"""

    __tablename__ = "user"

    id: str = Field(primary_key=True)  # 前端生成的 UUID
    username: str = Field(default="User", max_length=50)
    avatar: str | None = None
    plan: str = Field(default="Free", max_length=20)  # Free, Pilot, Maestro
    role: UserRole = Field(
        default=UserRole.USER,
        sa_column=Column(
            SAEnum(
                UserRole,
                name="user_role_enum",
                native_enum=True,
                values_callable=_enum_values,
            )
        ),  # DB-12: 使用 PostgreSQL ENUM
    )
    phone_number: str | None = Field(
        default=None, max_length=32, unique=True, index=True
    )
    email: str | None = Field(
        default=None, max_length=254, unique=True, index=True
    )
    password_hash: str | None = Field(default=None, max_length=255)
    verification_code: str | None = Field(default=None, max_length=16)
    verification_code_expires_at: datetime | None = Field(default=None)
    auth_provider: str | None = Field(
        default=None, max_length=32
    )  # 'phone', 'email', 'github', 'google', 'wechat'
    provider_id: str | None = Field(
        default=None, max_length=128, index=True
    )
    access_token: str | None = Field(default=None)
    refresh_token: str | None = Field(default=None)
    token_expires_at: datetime | None = Field(default=None)
    is_verified: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(
        default_factory=datetime.now,
        sa_column_kwargs={"onupdate": func.now},
    )

    # 关联关系
    threads: list[Thread] = Relationship(back_populates="user")
    custom_agents: list[CustomAgent] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
