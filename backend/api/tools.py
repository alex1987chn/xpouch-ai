"""
工具列表与治理 API
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import Session, select

from agents.tool_policy import BUILTIN_TOOL_POLICIES, ToolRiskTier, resolve_tool_metadata
from database import get_session
from dependencies import get_current_user
from models import ToolPolicy, ToolPolicyResponse, ToolPolicyUpdate, User, UserRole
from models.mcp import MCPServer
from services.tool_policy_service import ToolPolicyOverride, tool_policy_service
from utils.exceptions import AuthorizationError, NotFoundError, ValidationError
from utils.logger import logger

router = APIRouter(prefix="/api/tools", tags=["tools"])


class ToolInfo(BaseModel):
    """工具信息"""

    name: str
    description: str
    category: str  # builtin, mcp
    enabled: bool = True
    risk_tier: str
    approval_required: bool
    allowed_experts: list[str] | None = None
    blocked_experts: list[str] | None = None
    policy_note: str | None = None


class ToolsListResponse(BaseModel):
    """工具列表响应"""

    tools: list[ToolInfo]
    total: int
    builtin_count: int
    mcp_count: int


class ToolPolicyListResponse(BaseModel):
    policies: list[ToolPolicyResponse]
    total: int


VIEWABLE_ADMIN_ROLES = {UserRole.ADMIN, UserRole.EDIT_ADMIN, UserRole.VIEW_ADMIN}
EDITABLE_ADMIN_ROLES = {UserRole.ADMIN, UserRole.EDIT_ADMIN}


def _require_admin(current_user: User, *, editable: bool = False) -> None:
    allowed_roles = EDITABLE_ADMIN_ROLES if editable else VIEWABLE_ADMIN_ROLES
    if current_user.role not in allowed_roles:
        raise AuthorizationError("仅管理员可访问该工具治理能力")


def _build_effective_tool_infos(session: Session) -> list[ToolInfo]:
    overrides = {
        (record.tool_name, record.source): ToolPolicyOverride(
            tool_name=record.tool_name,
            source=record.source,
            enabled=record.enabled,
            risk_tier=record.risk_tier,
            approval_required=record.approval_required,
            allowed_experts=tuple(record.allowed_experts or ()),
            blocked_experts=tuple(record.blocked_experts or ()),
            policy_note=record.policy_note,
        )
        for record in session.exec(select(ToolPolicy)).all()
    }
    tools: list[ToolInfo] = []

    for name, metadata in BUILTIN_TOOL_POLICIES.items():
        effective = resolve_tool_metadata(
            name,
            source="builtin",
            description=metadata.description,
            overrides=overrides,
        )
        tools.append(
            ToolInfo(
                name=name,
                description=metadata.description,
                category="builtin",
                enabled=effective.enabled,
                risk_tier=effective.risk_tier.value,
                approval_required=effective.approval_required,
                allowed_experts=list(effective.allowed_experts) or None,
                blocked_experts=list(effective.blocked_experts) or None,
                policy_note=effective.policy_note,
            )
        )

    try:
        mcp_servers = session.exec(select(MCPServer).where(MCPServer.is_active)).all()
        for server in mcp_servers:
            effective = resolve_tool_metadata(
                server.name,
                source="mcp",
                description=server.description,
                overrides=overrides,
            )
            tools.append(
                ToolInfo(
                    name=server.name,
                    description=server.description or f"MCP 工具: {server.name}",
                    category="mcp",
                    enabled=effective.enabled,
                    risk_tier=effective.risk_tier.value,
                    approval_required=effective.approval_required,
                    allowed_experts=list(effective.allowed_experts) or None,
                    blocked_experts=list(effective.blocked_experts) or None,
                    policy_note=effective.policy_note,
                )
            )
    except Exception as e:
        logger.warning(f"[Tools API] 获取 MCP 工具失败: {e}")

    return tools


@router.get("/available", response_model=ToolsListResponse)
async def get_available_tools(
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
):
    """
    获取所有可用工具列表

    返回基础工具（内置）和 MCP 工具的合并列表，
    用于前端展示工具使用指南。
    """
    tools = _build_effective_tool_infos(session)
    builtin_count = sum(1 for tool in tools if tool.category == "builtin")
    mcp_count = sum(1 for tool in tools if tool.category == "mcp")

    return ToolsListResponse(
        tools=tools,
        total=len(tools),
        builtin_count=builtin_count,
        mcp_count=mcp_count,
    )


@router.get("/policies", response_model=ToolPolicyListResponse)
async def list_tool_policies(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    tools = _build_effective_tool_infos(session)
    records = {
        (record.tool_name, record.source): record
        for record in session.exec(select(ToolPolicy)).all()
    }
    policies = [
        ToolPolicyResponse(
            id=records.get((tool.name, tool.category)).id
            if records.get((tool.name, tool.category))
            else None,
            tool_name=tool.name,
            source=tool.category,
            enabled=tool.enabled,
            risk_tier=tool.risk_tier,
            approval_required=tool.approval_required,
            allowed_experts=tool.allowed_experts,
            blocked_experts=tool.blocked_experts,
            policy_note=tool.policy_note,
            description=tool.description,
            created_at=records.get((tool.name, tool.category)).created_at
            if records.get((tool.name, tool.category))
            else None,
            updated_at=records.get((tool.name, tool.category)).updated_at
            if records.get((tool.name, tool.category))
            else None,
        )
        for tool in tools
    ]
    return ToolPolicyListResponse(policies=policies, total=len(policies))


@router.put("/policies/{source}/{tool_name}", response_model=ToolPolicyResponse)
async def upsert_tool_policy(
    source: str,
    tool_name: str,
    payload: ToolPolicyUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user, editable=True)
    if source not in {"builtin", "mcp"}:
        raise ValidationError("source 仅支持 builtin 或 mcp")

    known_tools = {(tool.name, tool.category) for tool in _build_effective_tool_infos(session)}
    if (tool_name, source) not in known_tools:
        raise NotFoundError("工具策略")

    if payload.risk_tier is not None:
        try:
            ToolRiskTier(payload.risk_tier)
        except ValueError as exc:
            raise ValidationError("risk_tier 非法") from exc

    policy = session.exec(
        select(ToolPolicy)
        .where(ToolPolicy.tool_name == tool_name)
        .where(ToolPolicy.source == source)
    ).first()
    if policy is None:
        policy = ToolPolicy(tool_name=tool_name, source=source)
        session.add(policy)

    for field_name in (
        "enabled",
        "risk_tier",
        "approval_required",
        "allowed_experts",
        "blocked_experts",
        "policy_note",
    ):
        value = getattr(payload, field_name)
        if value is not None:
            setattr(policy, field_name, value)

    session.add(policy)
    session.commit()
    session.refresh(policy)
    await tool_policy_service.invalidate()

    return ToolPolicyResponse(
        id=policy.id,
        tool_name=policy.tool_name,
        source=policy.source,
        enabled=policy.enabled,
        risk_tier=policy.risk_tier,
        approval_required=policy.approval_required,
        allowed_experts=policy.allowed_experts,
        blocked_experts=policy.blocked_experts,
        policy_note=policy.policy_note,
        created_at=policy.created_at,
        updated_at=policy.updated_at,
    )
