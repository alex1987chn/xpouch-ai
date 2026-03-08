"""
工具治理 DTO
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ToolPolicyUpdate(BaseModel):
    enabled: bool | None = None
    risk_tier: str | None = None
    approval_required: bool | None = None
    allowed_experts: list[str] | None = None
    blocked_experts: list[str] | None = None
    policy_note: str | None = None


class ToolPolicyResponse(BaseModel):
    id: str | None = None
    tool_name: str
    source: str
    enabled: bool
    risk_tier: str
    approval_required: bool
    allowed_experts: list[str] | None = None
    blocked_experts: list[str] | None = None
    policy_note: str | None = None
    description: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)
