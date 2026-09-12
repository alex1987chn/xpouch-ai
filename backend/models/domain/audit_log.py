"""
审计日志领域模型

记录管理面关键变更（用户管理 / 专家配置 / 配额等），谁在何时改了什么。
只追加，不修改；查询在管理台"审计日志"页签。
"""

from datetime import datetime

from sqlalchemy import JSON, Column, Index
from sqlmodel import Field, SQLModel

from utils.time import utc_now_naive


class AuditLog(SQLModel, table=True):
    """审计日志表（append-only）"""

    __tablename__ = "auditlog"

    id: int | None = Field(default=None, primary_key=True)
    actor_user_id: str | None = Field(default=None, index=True, max_length=64)
    actor_username: str = Field(index=True, max_length=50)
    action: str = Field(index=True, max_length=64)  # 如 user.update / expert.delete / quota.update
    target: str | None = Field(default=None, max_length=128, index=True)
    detail: dict | None = Field(default=None, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=utc_now_naive, index=True)

    __table_args__ = (Index("idx_auditlog_created", "created_at"),)
