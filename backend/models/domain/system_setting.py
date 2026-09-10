"""系统级配置领域模型（键值表）"""

from datetime import datetime

from sqlalchemy import Column, Text, func
from sqlmodel import Field, SQLModel


class SystemSetting(SQLModel, table=True):
    """系统级键值配置。

    全局默认模型偏好、未来的 BYOK/通知开关等实例级配置都落这张表：
    相比 env 硬编码，DB 值可由管理员在运行时经接口修改，无需重启。
    value 为 JSON 字符串，由读写方负责序列化与校验。
    """

    __tablename__ = "system_setting"

    key: str = Field(primary_key=True, max_length=64)
    value: str = Field(sa_column=Column(Text, nullable=False))
    updated_at: datetime = Field(
        default_factory=datetime.now,
        sa_column_kwargs={"onupdate": func.now()},
    )
