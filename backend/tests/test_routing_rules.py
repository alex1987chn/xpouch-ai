"""路由确定性兜底规则测试（单一真相源 = agents/routing_rules.py）。

两层钉法：
1. 规则语义：各规则命中/不命中，特别是共现规则的「指令与对象分开说」
   情形（「删除我关于苹果的记忆」不含连续子串「删除记忆」）
2. **教材镜像闸门**：每条确定性规则的镜像词必须出现在 router 教材文本
   中——教材写了规则而代码不兜（或反之）都算口径漂移（2026-09-26 实例：
   教材收录了"删除/查看记忆"而代码关键词表没有，LLM 误判时兜底救不回来）
"""

from agents.routing_rules import (
    FORCED_COMPLEX_RULES,
    forced_complex_reason,
    forced_simple_reason,
    normalize_query,
)
from expert_config import EXPERT_DEFAULTS


def test_travel_and_realtime_rules():
    assert (
        forced_complex_reason("看下杭州钱塘区金沙天街离着我现在的江滨地铁站有多远，我得怎么过去")
        == "deterministic_travel_planning"
    )
    assert (
        forced_complex_reason("帮我查一下今天杭州天气和最新空气质量")
        == "deterministic_realtime_data"
    )


def test_smalltalk_not_forced():
    assert forced_complex_reason("你好，今天心情怎么样？") is None


def test_memory_write_and_management():
    assert forced_complex_reason("记住我是程序员") == "deterministic_memory_write"
    # 共现规则：指令与对象分开说也命中（此前代码兜底缺席的漂移场景）
    assert forced_complex_reason("删除我关于苹果的记忆") == "deterministic_memory_management"
    # 含「记住」子串的查询问句：先命中 memory_write（结果同为 complex，行为正确）
    assert forced_complex_reason("帮我看看你都记住了我什么") == "deterministic_memory_write"
    # 只有「记忆」没有管理动词 = 普通闲聊，不强制
    assert forced_complex_reason("人脑的记忆原理是什么") is None


def test_normalize_query_strips_whitespace():
    assert normalize_query("删除 我 关于 苹果 的 记忆") == "删除我关于苹果的记忆"


def test_forced_simple_attachment():
    assert (
        forced_simple_reason("【用户附件：xx.docx】帮我总结") == "deterministic_attachment_direct"
    )
    assert forced_simple_reason("普通问题") is None


def test_router_prompt_mirrors_deterministic_rules():
    """镜像闸门：确定性规则的关键词必须在 router 教材文本中出现。"""
    router_prompt = next(
        entry["system_prompt"] for entry in EXPERT_DEFAULTS if entry["expert_type"] == "router"
    )
    missing = {
        f"{rule.name}:{term}"
        for rule in FORCED_COMPLEX_RULES
        for term in rule.mirror_terms
        if term not in router_prompt
    }
    assert not missing, (
        f"路由口径漂移——确定性规则的关键词未出现在 router 教材中: {sorted(missing)}。"
        f"两层的同步契约见 agents/routing_rules.py 模块注释。"
    )
