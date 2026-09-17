"""领域枚举生成物必须是最新的（与事件协议同构的闸门）。

真相源 = `backend/models/enums.py`（与数据库枚举、迁移同源）。
`frontend/src/types/enums.generated.ts` 由 `scripts/gen_enums_ts.py` 生成。

改枚举忘了重新生成 → 这条测试失败（附修复命令）。前端那边还有第二道闸门：
引用处的联合类型会按新成员报错——本文件生成时前端 `Record<RunEventType, string>`
就曾因少了 `hitl_revision_started` / `hitl_revision_failed` 而编译不过（那两个事件
后端一直在写，前端手抄的联合漏了它们，改前只能靠人发现）。
"""

from __future__ import annotations

from enum import StrEnum

from models import enums as enums_module
from scripts import gen_enums_ts


def test_generated_ts_is_fresh():
    assert gen_enums_ts.check() == 0, (
        "frontend/src/types/enums.generated.ts 与 backend/models/enums.py 不一致；"
        "跑 `just gen-enums`（或 `cd backend && uv run python -m scripts.gen_enums_ts`）重新生成"
    )


def test_generator_output_is_deterministic():
    """同一份枚举生成两次必须逐字节一致（否则闸门会随机红）。

    frozenset 的迭代顺序受 hash 随机化影响，故脚本按枚举声明顺序重排——这条守住它。
    """
    assert gen_enums_ts.generate() == gen_enums_ts.generate()


def test_every_str_enum_is_generated():
    """models/enums.py 里的每个 StrEnum 都必须出现在生成物里。

    防止新增枚举时因为基类写法不同（非 StrEnum）而被脚本静默跳过——
    "生成了但漏一个"正是这类闸门要挡的。
    """
    generated = gen_enums_ts.generate()
    declared = {
        name
        for name, obj in vars(enums_module).items()
        if isinstance(obj, type)
        and issubclass(obj, StrEnum)
        and obj is not StrEnum
        and obj.__module__ == enums_module.__name__
    }

    assert declared, "models/enums.py 里没找到任何 StrEnum，脚本的收集逻辑可能失效了"
    for name in declared:
        assert f"export type {name} =" in generated, f"{name} 未被生成到前端类型里"
