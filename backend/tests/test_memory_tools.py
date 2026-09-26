"""记忆管理工具的护栏测试（2026-09-26 记忆删除能力）。

钉两条边界：
1. 治理白名单：search_memories / delete_memories 只有 memorize_expert 可用
   ——工具含删除副作用，泄漏给其他专家等于越权删记忆
2. 报告不入库：用过记忆工具的分支，输出是操作报告不是记忆素材——
   generic 的逐行入库必须跳过（历史"已为您删除…"回声即违反此条的产物）
"""

from agents.nodes.generic import _branch_used_memory_tools
from agents.tool_policy import evaluate_tool_policy
from tools.memory import MEMORY_TOOL_NAMES


class _FakeAIMessage:
    """只承载 tool_calls 属性的最小消息桩。"""

    def __init__(self, tool_calls):
        self.tool_calls = tool_calls


def test_memory_tools_allowed_only_for_memory_expert():
    for tool_name in ("search_memories", "delete_memories"):
        allowed = evaluate_tool_policy(tool_name=tool_name, expert_type="memorize_expert")
        assert allowed.allowed, f"{tool_name} 应对 memorize_expert 放行"

        for other in ("search", "coder", "analyzer"):
            denied = evaluate_tool_policy(tool_name=tool_name, expert_type=other)
            assert not denied.allowed, f"{tool_name} 不应泄漏给 {other}"


def test_branch_used_memory_tools_detects_calls():
    used = [_FakeAIMessage([{"name": "search_memories", "args": {"keyword": "苹果"}, "id": "c1"}])]
    assert _branch_used_memory_tools(used) is True

    not_used = [
        _FakeAIMessage([{"name": "asearch_web", "args": {"query": "x"}, "id": "c2"}]),
        _FakeAIMessage(None),
    ]
    assert _branch_used_memory_tools(not_used) is False
    assert _branch_used_memory_tools([]) is False


def test_runtime_tools_single_source_for_binding_and_execution():
    """绑定侧与执行侧共用 collect_runtime_tools（2026-09-26 not-a-valid-tool 事故钉）。

    记忆删除上线时工具清单在 generic.py（bind_tools）与 tool_runtime
    （ToolNode 执行）两侧各自构建，只注入了绑定侧——模型按教材调用、
    执行侧报 not a valid tool。单一真相源函数 + 本测试确保两侧清单
    含同样的记忆工具。
    """
    from agents.tool_runtime import collect_runtime_tools

    bound = collect_runtime_tools(
        expert_type="memorize_expert",
        branch_context={"user_id": "u-1"},
        mcp_tools=[],
    )
    executed = collect_runtime_tools(
        expert_type="memorize_expert",
        branch_context={"user_id": "u-1"},
        mcp_tools=[],
    )
    bound_names = {getattr(t, "name", getattr(t, "__name__", "")) for t in bound}
    executed_names = {getattr(t, "name", getattr(t, "__name__", "")) for t in executed}
    assert bound_names >= MEMORY_TOOL_NAMES, "绑定侧必须含记忆工具"
    assert bound_names == executed_names, "两侧清单必须一致（单一真相源）"

    # 隔离铁律：缺 user_id 不注入；其他专家不注入
    no_user = collect_runtime_tools(expert_type="memorize_expert", branch_context={}, mcp_tools=[])
    other_expert = collect_runtime_tools(
        expert_type="search", branch_context={"user_id": "u-1"}, mcp_tools=[]
    )
    for tools in (no_user, other_expert):
        names = {getattr(t, "name", getattr(t, "__name__", "")) for t in tools}
        assert not (MEMORY_TOOL_NAMES & names), "记忆工具不得泄漏到无 user_id 或其他专家"
