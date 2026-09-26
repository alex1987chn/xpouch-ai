"""内置专家词汇同步闸门。

ExpertType 枚举（models/enums.py）与内置种子清单（expert_config.EXPERT_DEFAULTS）
必须严格一致——2026-09-26 审计发现枚举只有 7 个执行型专家，commander/
router/aggregator/memorize_expert 四个编排链内置缺席（纯词汇漂移，无行为
影响，但 gen_enums_ts 会把残缺清单导给前端）。本测试把两侧钉死：加内置
专家而忘了改枚举（或反之），当场红。
"""

from expert_config import EXPERT_DEFAULTS
from models.enums import ExpertType


def test_expert_type_enum_matches_seed_roster():
    enum_values = {member.value for member in ExpertType}
    seed_roster = {entry["expert_type"] for entry in EXPERT_DEFAULTS}
    assert enum_values == seed_roster, (
        f"ExpertType 枚举与内置种子漂移：仅枚举有 {enum_values - seed_roster}，"
        f"仅种子有 {seed_roster - enum_values}"
    )
