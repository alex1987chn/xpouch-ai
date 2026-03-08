from agents.tool_policy import (
    ToolPolicyAction,
    evaluate_tool_policy,
    filter_tools_for_binding,
    infer_mcp_tool_metadata,
)
from services.tool_policy_service import ToolPolicyOverride


class _DummyTool:
    def __init__(self, name: str, description: str = ""):
        self.name = name
        self.description = description


def test_memorize_expert_cannot_use_search_web():
    decision = evaluate_tool_policy(
        tool_name="search_web",
        expert_type="memorize_expert",
        source="builtin",
    )

    assert decision.action == ToolPolicyAction.DENY
    assert "memorize_expert" in decision.reason


def test_high_risk_mcp_tool_requires_approval():
    metadata = infer_mcp_tool_metadata("filesystem_write", "写入本地文件")

    assert metadata.approval_required is True
    assert metadata.risk_tier.value == "high"


def test_filter_tools_for_binding_excludes_blocked_and_high_risk_tools():
    tools = [
        _DummyTool("search_web", "联网搜索"),
        _DummyTool("calculator", "数学计算"),
        _DummyTool("filesystem_write", "写入本地文件"),
    ]

    bindable, blocked = filter_tools_for_binding(tools, expert_type="memorize_expert")

    assert [tool.name for tool in bindable] == ["calculator"]
    assert {decision.tool_name for decision in blocked} == {"search_web", "filesystem_write"}


def test_override_can_disable_tool():
    decision = evaluate_tool_policy(
        tool_name="calculator",
        expert_type="planner",
        source="builtin",
        overrides={
            ("calculator", "builtin"): ToolPolicyOverride(
                tool_name="calculator",
                source="builtin",
                enabled=False,
                risk_tier="low",
                approval_required=False,
                allowed_experts=(),
                blocked_experts=(),
                policy_note="maintenance window",
            )
        },
    )

    assert decision.action == ToolPolicyAction.DENY
    assert "禁用" in decision.reason


def test_override_can_allow_only_specific_experts():
    decision = evaluate_tool_policy(
        tool_name="read_webpage",
        expert_type="coder",
        source="builtin",
        overrides={
            ("read_webpage", "builtin"): ToolPolicyOverride(
                tool_name="read_webpage",
                source="builtin",
                enabled=True,
                risk_tier="medium",
                approval_required=False,
                allowed_experts=("search",),
                blocked_experts=(),
                policy_note="only search expert can use this",
            )
        },
    )

    assert decision.action == ToolPolicyAction.DENY
    assert "允许名单" in decision.reason
