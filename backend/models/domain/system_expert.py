"""
系统专家领域模型

包含：
- SystemExpert: 系统专家配置表
"""

from __future__ import annotations

import os
from datetime import datetime

from sqlalchemy import Index, func
from sqlmodel import Field, SQLModel


class SystemExpert(SQLModel, table=True):
    """
    系统专家表：存储 LangGraph 专家的 Prompt 和配置

    管理员可以通过前端动态修改专家的 system_prompt，
    LangGraph 执行任务时从数据库读取最新配置。
    """

    __table_args__ = (
        # DB-8: 统一索引命名前缀
        Index("idx_systemexpert_expert_key", "expert_key", unique=True),
    )

    # DB-10: 主键策略统一为 UUID
    id: str = Field(
        default_factory=lambda: __import__("uuid").uuid4(),
        primary_key=True,
    )
    expert_key: str = Field(
        max_length=64,
        description="专家类型标识（对应 ExpertType 枚举，如 'coder', 'search'）",
    )
    name: str = Field(max_length=255, description="专家显示名称")
    description: str | None = Field(
        default=None,
        description="专家能力描述，用于 Planner 决定任务分配",
    )
    system_prompt: str = Field(
        description="专家系统提示词（核心字段，管理员可修改）"
    )
    model: str = Field(
        default_factory=lambda: os.getenv("MODEL_NAME", "deepseek-chat"),
        max_length=128,
        description="使用的模型",
    )
    temperature: float = Field(default=0.5, description="温度参数（0.0-2.0）")
    is_dynamic: bool = Field(
        default=True,
        description="是否为动态专家，false=系统内置，true=用户创建",
    )
    # 系统核心组件标记（不可删除）
    is_system: bool = Field(
        default=False, description="是否为系统核心组件，true=禁止删除"
    )
    # 配置版本号（乐观锁，用于并发更新检测）
    config_version: int = Field(
        default=0, description="配置版本号，每次更新自动递增"
    )
    created_at: datetime = Field(
        default_factory=datetime.now, description="创建时间"
    )
    updated_at: datetime = Field(
        default_factory=datetime.now,
        sa_column_kwargs={"onupdate": func.now()},
        description="最后更新时间",
    )
