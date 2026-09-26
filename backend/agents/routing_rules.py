"""路由判定的确定性规则——单一真相源（2026-09-26 路由归一）。

[为什么需要这个模块] "什么走 complex"的口径此前散在三处各自维护：
router 教材（喂 LLM 的自然语言规则）、router_node 内联的关键词元组
（代码级确定性兜底）、附件强制简单规则——三者描述同一语义却无同步
机制，必然漂移（2026-09-26 实例：教材已收录"删除/查看记忆"指令，
代码兜底关键词表却没有，LLM 误判时兜底救不回来）。

归一原则：
- **教材与代码兜底是两个本质不同的层**（一个说服模型、一个确定性保底），
  不强行合并；本模块收编全部**确定性规则**为单一真相源
- **镜像闸门**（tests/test_routing_rules.py）：每条确定性规则的关键词
  必须在 router 教材文本中出现——教材写了规则而代码不兜（或反之），
  测试当场红，漂移不再靠人发现
- 新增路由规则 = 在这里加一条结构化规则 + 教材同步一行 + 闸门自动覆盖
"""

from __future__ import annotations

import re
from collections.abc import Callable

from utils.logger import logger

# 规则匹配器：输入去空格小写后的查询，返回是否命中
RuleMatcher = Callable[[str], bool]


def _any_keyword(*keywords: str) -> RuleMatcher:
    """任一关键词命中（substring）。"""

    def match(normalized_query: str) -> bool:
        return any(k in normalized_query for k in keywords)

    return match


def _all_of(*must: str) -> RuleMatcher:
    """全部关键词共现（如「删除」+「记忆」——指令与对象分开说的情形）。"""

    def match(normalized_query: str) -> bool:
        return all(k in normalized_query for k in must)

    return match


def _co_word(subject: str, *verbs: str) -> RuleMatcher:
    """主体词与任一动词共现：「删除我关于苹果的记忆」= 记忆 × 删除。"""

    def match(normalized_query: str) -> bool:
        return subject in normalized_query and any(v in normalized_query for v in verbs)

    return match


class ForcedComplexRule:
    """确定性 complex 兜底规则（结构化：名称/匹配器/原因/教材镜像词）。"""

    def __init__(self, name: str, matcher: RuleMatcher, reason: str, mirror_terms: tuple[str, ...]):
        self.name = name
        self.matcher = matcher
        self.reason = reason
        # 镜像词：这些词必须出现在 router 教材文本中（闸门测试用）——
        # 教材描述了规则而代码不兜（或反之）都算口径漂移
        self.mirror_terms = mirror_terms


FORCED_COMPLEX_RULES: tuple[ForcedComplexRule, ...] = (
    ForcedComplexRule(
        name="memory_write",
        matcher=_any_keyword("记住", "保存", "记下来"),
        reason="deterministic_memory_write",
        mirror_terms=("记住", "保存"),
    ),
    ForcedComplexRule(
        name="memory_management",
        # 教材已收录"删除/查看/管理记忆"指令（2026-09-26 记忆删除能力），
        # 代码兜底此前缺席——本规则即补齐那次漂移
        matcher=_co_word("记忆", "删除", "清除", "查看", "管理", "清空"),
        reason="deterministic_memory_management",
        mirror_terms=("删除", "查看"),
    ),
    ForcedComplexRule(
        name="realtime_data",
        matcher=_any_keyword("天气", "新闻", "股票", "汇率", "实时", "最新"),
        reason="deterministic_realtime_data",
        mirror_terms=("天气", "新闻", "最新"),
    ),
    ForcedComplexRule(
        name="artifact_generation",
        matcher=_any_keyword("生成图片", "生成文档", "分析文件", "运行代码"),
        reason="deterministic_artifact_generation",
        mirror_terms=("生成图片", "运行代码"),
    ),
    ForcedComplexRule(
        name="travel_planning",
        matcher=_any_keyword(
            "怎么去",
            "怎么过去",
            "怎么走",
            "路线",
            "路程",
            "多远",
            "距离",
            "地铁",
            "公交",
            "打车",
            "导航",
        ),
        reason="deterministic_travel_planning",
        mirror_terms=("路线",),
    ),
)

# 附件文档消息的标记前缀（消息注入协议，见 router_node 附件兜底注释）
ATTACHMENT_MARKER = "【用户附件："


def normalize_query(user_query: str) -> str:
    """去空白 + 小写（关键词匹配的统一口径）。"""
    return re.sub(r"\s+", "", (user_query or "").lower())


def forced_simple_reason(user_query: str) -> str | None:
    """确定性 simple 兜底：带附件文档的消息直达回复（文档问答=轻量场景）。"""
    if ATTACHMENT_MARKER in (user_query or ""):
        return "deterministic_attachment_direct"
    return None


def forced_complex_reason(user_query: str) -> str | None:
    """对高风险误判场景返回确定性 complex 兜底原因；未命中返回 None。"""
    normalized = normalize_query(user_query)
    for rule in FORCED_COMPLEX_RULES:
        if rule.matcher(normalized):
            logger.info("[RoutingRules] 命中确定性 complex 兜底: %s", rule.name)
            return rule.reason
    return None
