"""从后端领域枚举生成前端 TS 联合类型。

**为什么**：前端 `types/run.ts` 手抄了 `RunStatus` / `RunEventType`，靠注释写着
"与后端 RunStatus 保持一致"——注释不是闸门。后端加成员或改名时，前端最坏的情况是
**静默少识别一个状态**（手写联合少一个成员不会让任何代码编译报错），历史上这类漂移
只能靠人发现。真相源一直是 `backend/models/enums.py`（与迁移、DB 约束同源），
这里把它导出成 TS。

生成物对每个枚举同时产出运行时常量数组与派生类型：

    export const RUN_STATUS_VALUES = ['queued', ...] as const
    export type RunStatus = (typeof RUN_STATUS_VALUES)[number]

前者供运行期使用（filter / 校验），后者与原来的手写字面量联合**语义等价**，替换是零
行为变化的。模块级的 `frozenset[枚举]` 常量（如 `TERMINAL_RUN_STATUSES`）一并生成，
前端不必再手抄一份"哪些状态算终态"。frozenset 成员按枚举声明顺序输出，保证生成结果
逐字节稳定（集合迭代顺序受 hash 随机化影响，不能直接照搬）。

两道闸门（与事件协议同构）：
  1. 后端 pytest：生成结果与仓库文件不一致即失败（tests/test_enums_ts_fresh.py）
  2. 前端 tsc：引用处按类型报错（联合少成员 / 改名都会红）

**生成物不要手改**。改枚举 = 改 `models/enums.py` → 重新生成。

用法：
    cd backend && .venv/Scripts/python -m scripts.gen_enums_ts            # 写入
    cd backend && .venv/Scripts/python -m scripts.gen_enums_ts --check    # 只校验（CI/测试）
"""

from __future__ import annotations

import argparse
import re
import sys
from enum import StrEnum
from pathlib import Path

import models.enums as enums_module

BACKEND_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_PATH = BACKEND_ROOT.parent / "frontend" / "src" / "types" / "enums.generated.ts"

HEADER = """/**
 * ⚠️ 本文件由 `backend/scripts/gen_enums_ts.py` 生成，**不要手改**。
 *
 * 真相源：`backend/models/enums.py`（与数据库枚举、迁移同源）
 * 重新生成：`cd backend && .venv/Scripts/python -m scripts.gen_enums_ts`
 *
 * 每个枚举产出 `X_VALUES`（运行时常量数组）+ 同名联合类型；后端也有 pytest
 * 断言本文件是最新的——枚举漂移无法悄悄合入。
 */
"""


def _screaming_snake(name: str) -> str:
    """RunEventType → RUN_EVENT_TYPE（常量的命名规则，可预测）"""
    return re.sub(r"(?<!^)(?=[A-Z])", "_", name).upper()


def _enum_classes() -> list[type[StrEnum]]:
    """本模块定义的 StrEnum，按声明顺序（新增枚举自动纳入，无需改本脚本）。"""
    return [
        obj
        for obj in vars(enums_module).values()
        if isinstance(obj, type)
        and issubclass(obj, StrEnum)
        and obj is not StrEnum
        and obj.__module__ == enums_module.__name__
    ]


def _enum_constants() -> list[tuple[str, list[str]]]:
    """模块级 frozenset[枚举] 常量 → (常量名, 按枚举声明顺序排列的值列表)。

    顺序不能直接用集合迭代顺序（受 hash 随机化影响会让生成物不稳定），
    故按所属枚举的声明顺序重排。
    """
    enum_order = {cls: [member.value for member in cls] for cls in _enum_classes()}
    result: list[tuple[str, list[str]]] = []
    for name, obj in vars(enums_module).items():
        if not isinstance(obj, frozenset):
            continue
        owner = next(
            (cls for cls in enum_order if all(value in enum_order[cls] for value in obj)),
            None,
        )
        if owner is None:
            continue
        result.append((name, [value for value in enum_order[owner] if value in obj]))
    return result


def generate() -> str:
    """生成 TS 源码（纯函数：--check 与写入共用同一份输出）。"""
    chunks: list[str] = [HEADER]

    for cls in _enum_classes():
        values = ", ".join(f"'{member.value}'" for member in cls)
        chunks.append(
            f"/** {cls.__name__}（真相源：backend/models/enums.py） */\n"
            f"export const {_screaming_snake(cls.__name__)}_VALUES = [{values}] as const\n"
            f"export type {cls.__name__} = (typeof {_screaming_snake(cls.__name__)}_VALUES)[number]\n"
        )

    for name, values in _enum_constants():
        rendered = ", ".join(f"'{value}'" for value in values)
        chunks.append(f"export const {name} = [{rendered}] as const\n")

    return "\n".join(chunks)


def check() -> int:
    """校验仓库里的文件是否与生成结果一致（不一致返回 1）。"""
    expected = generate()
    if not OUTPUT_PATH.exists():
        print(f"[gen-enums] 缺少生成文件: {OUTPUT_PATH}")
        return 1
    if OUTPUT_PATH.read_text(encoding="utf-8") != expected:
        print(
            "[gen-enums] 生成文件已过期（models/enums.py 改了但没重新生成）。\n"
            "  修复：cd backend && .venv/Scripts/python -m scripts.gen_enums_ts"
        )
        return 1
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="只校验不写入")
    args = parser.parse_args(argv)

    if args.check:
        return check()

    content = generate()
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    if OUTPUT_PATH.exists() and OUTPUT_PATH.read_text(encoding="utf-8") == content:
        print(f"[gen-enums] 无需更新: {OUTPUT_PATH}")
        return 0
    OUTPUT_PATH.write_text(content, encoding="utf-8", newline="\n")
    print(f"[gen-enums] 已写入: {OUTPUT_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
