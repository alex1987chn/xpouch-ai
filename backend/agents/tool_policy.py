"""
工具治理策略。

第一版目标：
- 提供统一的工具风险分级与策略判定入口
- 在工具绑定阶段就过滤明显不该暴露给当前 expert 的工具
- 在工具执行阶段做最后一道强制校验
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import Any

from services.tool_policy_service import ToolPolicyOverride


class ToolRiskTier(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class ToolPolicyAction(StrEnum):
    ALLOW = "allow"
    DENY = "deny"
    REQUIRE_APPROVAL = "require_approval"


@dataclass(frozen=True)
class ToolPolicyMetadata:
    name: str
    source: str
    description: str
    risk_tier: ToolRiskTier
    approval_required: bool
    enabled: bool = True
    allowed_experts: tuple[str, ...] = ()
    blocked_experts: tuple[str, ...] = ()
    policy_note: str | None = None


@dataclass(frozen=True)
class ToolPolicyDecision:
    tool_name: str
    source: str
    action: ToolPolicyAction
    risk_tier: ToolRiskTier
    reason: str
    policy_note: str | None

    @property
    def allowed(self) -> bool:
        return self.action == ToolPolicyAction.ALLOW

    @property
    def requires_approval(self) -> bool:
        return self.action == ToolPolicyAction.REQUIRE_APPROVAL


BUILTIN_TOOL_POLICIES: dict[str, ToolPolicyMetadata] = {
    "search_web": ToolPolicyMetadata(
        name="search_web",
        source="builtin",
        description="联网搜索，获取实时信息",
        risk_tier=ToolRiskTier.MEDIUM,
        approval_required=False,
        blocked_experts=("memorize_expert",),
        policy_note="记忆专家不应主动联网检索，避免把外部搜索混入记忆抽取链路。",
    ),
    "read_webpage": ToolPolicyMetadata(
        name="read_webpage",
        source="builtin",
        description="读取网页内容",
        risk_tier=ToolRiskTier.MEDIUM,
        approval_required=False,
        blocked_experts=("memorize_expert",),
        policy_note="记忆专家不应主动读取外部网页，避免记忆提取链路越界。",
    ),
    "calculator": ToolPolicyMetadata(
        name="calculator",
        source="builtin",
        description="数学计算",
        risk_tier=ToolRiskTier.LOW,
        approval_required=False,
        policy_note="只做纯计算，不涉及外部副作用。",
    ),
    "get_current_time": ToolPolicyMetadata(
        name="get_current_time",
        source="builtin",
        description="获取当前时间",
        risk_tier=ToolRiskTier.LOW,
        approval_required=False,
        policy_note="只读时间信息，不涉及外部副作用。",
    ),
}

HIGH_RISK_KEYWORDS = (
    "write",
    "delete",
    "remove",
    "update",
    "create",
    "insert",
    "post",
    "send",
    "email",
    "sms",
    "shell",
    "exec",
    "execute",
    "command",
    "filesystem",
    "file",
    "database",
    "sql",
)


def get_tool_name(tool: Any) -> str:
    """获取工具名。"""
    return getattr(tool, "name", None) or getattr(tool, "__name__", "unknown_tool")


def get_builtin_tool_names() -> set[str]:
    """获取内置工具名集合。"""
    return set(BUILTIN_TOOL_POLICIES)


def infer_mcp_tool_metadata(name: str, description: str | None = None) -> ToolPolicyMetadata:
    """根据工具名/描述推断 MCP 工具策略。"""
    haystack = f"{name} {description or ''}".lower()
    is_high_risk = any(keyword in haystack for keyword in HIGH_RISK_KEYWORDS)
    if is_high_risk:
        return ToolPolicyMetadata(
            name=name,
            source="mcp",
            description=description or f"MCP 工具: {name}",
            risk_tier=ToolRiskTier.HIGH,
            approval_required=True,
            policy_note="推断为可能产生副作用的 MCP 工具，第一版治理要求额外审批。",
        )

    return ToolPolicyMetadata(
        name=name,
        source="mcp",
        description=description or f"MCP 工具: {name}",
        risk_tier=ToolRiskTier.MEDIUM,
        approval_required=False,
        policy_note="默认视为只读型 MCP 工具；如具备副作用，应在名称/描述中明确标识。",
    )


def resolve_tool_metadata(
    tool_name: str,
    *,
    source: str | None = None,
    description: str | None = None,
    overrides: dict[tuple[str, str], ToolPolicyOverride] | None = None,
) -> ToolPolicyMetadata:
    """解析工具治理元数据。"""
    resolved_source = source or "mcp"
    if tool_name in BUILTIN_TOOL_POLICIES:
        metadata = BUILTIN_TOOL_POLICIES[tool_name]
    elif resolved_source == "builtin":
        metadata = ToolPolicyMetadata(
            name=tool_name,
            source="builtin",
            description=description or tool_name,
            risk_tier=ToolRiskTier.MEDIUM,
            approval_required=False,
            policy_note="未知内置工具，默认按中风险只读工具处理。",
        )
    else:
        metadata = infer_mcp_tool_metadata(tool_name, description)

    if not overrides:
        return metadata

    override = overrides.get((tool_name, metadata.source))
    if override is None:
        return metadata

    risk_tier = ToolRiskTier(override.risk_tier)
    return ToolPolicyMetadata(
        name=metadata.name,
        source=metadata.source,
        description=metadata.description,
        risk_tier=risk_tier,
        approval_required=override.approval_required,
        enabled=override.enabled,
        allowed_experts=override.allowed_experts,
        blocked_experts=override.blocked_experts,
        policy_note=override.policy_note or metadata.policy_note,
    )


def evaluate_tool_policy(
    *,
    tool_name: str,
    expert_type: str | None = None,
    source: str | None = None,
    description: str | None = None,
    overrides: dict[tuple[str, str], ToolPolicyOverride] | None = None,
) -> ToolPolicyDecision:
    """评估某个工具在当前上下文中的治理决策。"""
    metadata = resolve_tool_metadata(
        tool_name,
        source=source,
        description=description,
        overrides=overrides,
    )

    if not metadata.enabled:
        return ToolPolicyDecision(
            tool_name=tool_name,
            source=metadata.source,
            action=ToolPolicyAction.DENY,
            risk_tier=metadata.risk_tier,
            reason=f"工具 {tool_name} 当前被策略禁用",
            policy_note=metadata.policy_note,
        )

    if expert_type and metadata.allowed_experts and expert_type not in metadata.allowed_experts:
        return ToolPolicyDecision(
            tool_name=tool_name,
            source=metadata.source,
            action=ToolPolicyAction.DENY,
            risk_tier=metadata.risk_tier,
            reason=f"专家 {expert_type} 不在工具 {tool_name} 的允许名单内",
            policy_note=metadata.policy_note,
        )

    if expert_type and expert_type in metadata.blocked_experts:
        return ToolPolicyDecision(
            tool_name=tool_name,
            source=metadata.source,
            action=ToolPolicyAction.DENY,
            risk_tier=metadata.risk_tier,
            reason=f"专家 {expert_type} 不允许调用工具 {tool_name}",
            policy_note=metadata.policy_note,
        )

    if metadata.approval_required:
        return ToolPolicyDecision(
            tool_name=tool_name,
            source=metadata.source,
            action=ToolPolicyAction.REQUIRE_APPROVAL,
            risk_tier=metadata.risk_tier,
            reason=f"工具 {tool_name} 属于 {metadata.risk_tier.value} 风险操作，当前策略要求额外审批",
            policy_note=metadata.policy_note,
        )

    return ToolPolicyDecision(
        tool_name=tool_name,
        source=metadata.source,
        action=ToolPolicyAction.ALLOW,
        risk_tier=metadata.risk_tier,
        reason="allowed",
        policy_note=metadata.policy_note,
    )


def filter_tools_for_binding(
    tools: list[Any],
    *,
    expert_type: str | None = None,
    overrides: dict[tuple[str, str], ToolPolicyOverride] | None = None,
) -> tuple[list[Any], list[ToolPolicyDecision]]:
    """在绑定给 LLM 前先过滤明显不应暴露的工具。"""
    bindable_tools: list[Any] = []
    blocked: list[ToolPolicyDecision] = []
    builtin_names = get_builtin_tool_names()

    for tool in tools:
        tool_name = get_tool_name(tool)
        description = getattr(tool, "description", None)
        source = "builtin" if tool_name in builtin_names else "mcp"
        decision = evaluate_tool_policy(
            tool_name=tool_name,
            expert_type=expert_type,
            source=source,
            description=description,
            overrides=overrides,
        )
        if decision.allowed:
            bindable_tools.append(tool)
        else:
            blocked.append(decision)

    return bindable_tools, blocked


def build_tool_policy_message(decision: ToolPolicyDecision) -> str:
    """构建给模型和用户都可理解的策略消息。"""
    if decision.requires_approval:
        return (
            f"⛔ 工具 {decision.tool_name} 已被策略拦截：{decision.reason}。"
            f"请改用低风险只读工具，或等待后续 selective approval 能力接入。"
        )
    return f"⛔ 工具 {decision.tool_name} 已被策略拒绝：{decision.reason}。请改用允许的工具继续完成任务。"
