"""
工具策略领域模型
"""

from datetime import datetime

from sqlalchemy import JSON, Boolean, Column, Index, String, func
from sqlmodel import Field, SQLModel

from utils.time import utc_now


class ToolPolicy(SQLModel, table=True):
    """工具治理策略覆盖表。"""

    __table_args__ = (Index("idx_toolpolicy_tool_name_source", "tool_name", "source", unique=True),)

    __tablename__ = "toolpolicy"

    id: str = Field(default_factory=lambda: str(__import__("uuid").uuid4()), primary_key=True)
    tool_name: str = Field(max_length=128, description="工具名")
    source: str = Field(
        default="builtin",
        sa_column=Column(String(32), nullable=False, index=True),
        description="工具来源：builtin / mcp",
    )
    enabled: bool = Field(default=True, description="是否启用该工具")
    risk_tier: str = Field(default="medium", max_length=16, description="风险等级")
    approval_required: bool = Field(default=False, description="是否需要审批")
    allowed_experts: list[str] | None = Field(default=None, sa_column=Column(JSON))
    blocked_experts: list[str] | None = Field(default=None, sa_column=Column(JSON))
    policy_note: str | None = Field(default=None, description="策略说明")
    # 延迟加载（仅 MCP 工具生效）：不进常驻绑定集，经 search_tools 按需检索展开。
    # 见 agents/deferred_tools.py 协议说明；默认 false = 行为与延迟层引入前一致
    deferred: bool = Field(
        default=False,
        sa_column=Column(Boolean, nullable=False, server_default="false"),
        description="是否延迟加载（按需检索展开，仅 MCP 生效）",
    )
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(
        default_factory=utc_now,
        sa_column_kwargs={"onupdate": func.now()},
    )
