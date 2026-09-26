"""记忆管理工具的护栏测试（2026-09-26 记忆删除能力）。

钉两条边界：
1. 治理白名单：search_memories / delete_memories 只有 memorize_expert 可用
   ——工具含删除副作用，泄漏给其他专家等于越权删记忆
2. 报告不入库：用过记忆工具的分支，输出是操作报告不是记忆素材——
   generic 的逐行入库必须跳过（历史"已为您删除…"回声即违反此条的产物）
"""

from agents.nodes.generic import _branch_used_memory_tools
from agents.tool_policy import evaluate_tool_policy


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
