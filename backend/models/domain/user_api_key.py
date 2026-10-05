"""BYOK 用户 API Key 领域模型（2026-10-05 BYOK v1）。

每用户每 provider 一行；密文落库（utils/byok.py Fernet），key_hint 为
掩码尾 4 位（界面展示），明文任何界面/API 不返回。解析链与信任边界见
utils/byok.py 模块注释。
"""

from datetime import datetime

from sqlalchemy import Column, Text
from sqlmodel import Field, SQLModel, UniqueConstraint

from utils.time import utc_now


class UserApiKey(SQLModel, table=True):
    """用户自带的 provider API Key（BYOK）"""

    __tablename__ = "user_api_keys"
    __table_args__ = (UniqueConstraint("user_id", "provider", name="uq_user_api_key"),)

    id: str = Field(
        default_factory=lambda: str(__import__("uuid").uuid4()),
        primary_key=True,
        max_length=64,
    )
    user_id: str = Field(foreign_key="user.id", index=True, max_length=64, ondelete="CASCADE")
    provider: str = Field(max_length=64, index=True)

    encrypted_key: str = Field(sa_column=Column(Text, nullable=False))
    key_hint: str = Field(default="", max_length=16)

    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(
        default_factory=utc_now,
        sa_column_kwargs={"nullable": False},
    )
