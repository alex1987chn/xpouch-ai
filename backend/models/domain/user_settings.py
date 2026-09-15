"""用户偏好设置领域模型

包含：
- UserSettings: 用户偏好设置表（JSON 存储，按 user_id 一对一）

说明：该表由迁移 20260902_120000 建表、服务层经 SQL 直接读写；补建模的目的是
让 SQLModel.metadata 完整（alembic check / autogenerate 不再把它当「多余的表」，
评审 M1 漂移对齐）。字段必须与迁移 DDL 逐字一致。
"""

from datetime import datetime

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


class UserSettings(SQLModel, table=True):
    """用户偏好设置（user_id 主键，一对一）"""

    __tablename__ = "user_settings"

    user_id: str = Field(foreign_key="user.id", primary_key=True, max_length=255)
    preferences: dict = Field(sa_column=Column(JSON, nullable=False))
    updated_at: datetime = Field(
        sa_column_kwargs={"nullable": False},
    )
