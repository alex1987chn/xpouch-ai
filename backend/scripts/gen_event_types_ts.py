"""从后端事件模型生成前端 TS 类型（决定 6）。

**为什么**：SSE 事件协议此前是「后端 pydantic 模型 + 前端手写 interface」两份平行真相，
靠人对齐。字段一旦改名（`duration_ms`、`artifact_count` 这类），前端不一定编译报错，
而是**静默少读一个字段**——历史上已经这么丢过数据。真相源其实一直在
`backend/event_types/events.py`（每个事件都有 `*Data` 模型 + `EventType` 枚举，
`build_sse_event` 就是拿它们构线的），所以这里把它导出成 TS，
再用两道闸门钉住不再漂移：
  1. 后端 pytest：生成结果与仓库里的文件不一致就失败（见 tests/test_event_types_ts_fresh.py）
  2. 前端 tsc：`types/events.ts` 里每条手写类型都与生成类型做**双向**一致性断言
     （Exact<>），任何一侧字段漂移都编译不过

**生成物不要手改**。改协议 = 改后端模型 → 重新生成 → 前端按编译错误对齐。

用法：
    cd backend && .venv/Scripts/python -m scripts.gen_event_types_ts            # 写入
    cd backend && .venv/Scripts/python -m scripts.gen_event_types_ts --check    # 只校验（CI/测试）
"""

from __future__ import annotations

import argparse
import sys
import types as pytypes
import typing
from enum import Enum
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel

from event_types.events import EventType

BACKEND_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_PATH = BACKEND_ROOT.parent / "frontend" / "src" / "types" / "events.generated.ts"

HEADER = """/**
 * ⚠️ 本文件由 `backend/scripts/gen_event_types_ts.py` 生成，**不要手改**。
 *
 * 真相源：`backend/event_types/events.py`（EventType 枚举 + 各事件的 pydantic 模型）
 * 重新生成：`cd backend && .venv/Scripts/python -m scripts.gen_event_types_ts`
 *
 * 前端手写的 `types/events.ts` 会与这里的每条 payload 类型做双向一致性断言，
 * 后端也有 pytest 断言本文件是最新的——协议漂移在两侧都无法悄悄合入。
 */
"""


# ---------------------------------------------------------------------------
# 类型映射：pydantic 注解 → TS
# ---------------------------------------------------------------------------

_PRIMITIVES: dict[Any, str] = {
    str: "string",
    int: "number",
    float: "number",
    bool: "boolean",
    type(None): "null",
    Any: "unknown",
}


def _ts_type(annotation: Any) -> str:
    """把一个 Python 注解翻成 TS 类型表达式。"""
    if annotation in _PRIMITIVES:
        return _PRIMITIVES[annotation]

    # Optional / Union（含 X | None）
    if typing.get_origin(annotation) in (typing.Union, pytypes.UnionType):
        rendered = [_ts_type(arg) for arg in typing.get_args(annotation)]
        # 去重保序：`str | None` 只需 "string | null"
        seen: list[str] = []
        for item in rendered:
            if item not in seen:
                seen.append(item)
        return " | ".join(seen)

    origin = typing.get_origin(annotation)
    args = typing.get_args(annotation)

    # Literal["a", "b"] → 'a' | 'b'（后端把状态类字段收窄成字面量，前端也这么写）
    if origin is Literal:
        return " | ".join(json_repr(arg) for arg in args)

    if origin in (list, set, tuple):
        inner = _ts_type(args[0]) if args else "unknown"
        # 联合类型要加括号，避免 "string | null[]" 这种歧义
        return f"({inner})[]" if " | " in inner else f"{inner}[]"

    if origin is dict:
        key = _ts_type(args[0]) if args else "string"
        value = _ts_type(args[1]) if len(args) > 1 else "unknown"
        return f"Record<{key}, {value}>"

    if isinstance(annotation, type) and issubclass(annotation, BaseModel):
        return annotation.__name__

    if isinstance(annotation, type) and issubclass(annotation, Enum):
        return " | ".join(f"'{member.value}'" for member in annotation)

    # 兜底：不认识就退化成 unknown，并在注释里点名（生成物可读性优先于猜测）
    return "unknown"


def json_repr(value: Any) -> str:
    """TS 里的字面量写法：字符串加单引号，其余原样（数字/布尔）"""
    if isinstance(value, str):
        return f"'{value}'"
    return str(value).lower() if isinstance(value, bool) else str(value)


def _render_model(model: type[BaseModel]) -> str:
    lines = [f"export interface {model.__name__} {{"]
    for name, field in model.model_fields.items():
        optional = "" if field.is_required() else "?"
        lines.append(f"  {name}{optional}: {_ts_type(field.annotation)}")
    lines.append("}")
    return "\n".join(lines)


def _pascal(member: str) -> str:
    return "".join(part.capitalize() for part in member.split("_"))


def _payload_models() -> list[type[BaseModel]]:
    """按 EventType 推导每个事件对应的 `*Data` 模型（约定：成员名 Pascal + Data）。

    缺模型直接抛错——新增事件类型必须补 payload 模型，这本身就是一道闸门
    （此前出现过「事件发了但前端没有对应类型」的静默缺口）。
    再递归收集这些模型引用到的嵌套模型（TaskInfo / ArtifactInfo / ThinkingData ...），
    保证生成物里所有被引用的类型都有定义（此前靠一份硬编码名单，新增嵌套模型就会漏）。
    """
    from event_types import events as events_module

    models: list[type[BaseModel]] = []
    seen: set[str] = set()

    def _collect(model: type[BaseModel]) -> None:
        """后序收集：先收依赖，再收自己（保证 TS 里被引用者先声明）"""
        if model.__name__ in seen:
            return
        seen.add(model.__name__)
        for field in model.model_fields.values():
            for nested in _nested_models(field.annotation):
                _collect(nested)
        models.append(model)

    for member in EventType:
        model_name = f"{_pascal(member.name)}Data"
        model = getattr(events_module, model_name, None)
        if model is None or not (isinstance(model, type) and issubclass(model, BaseModel)):
            raise RuntimeError(
                f"事件 {member.value!r}（{member.name}）缺少 payload 模型 {model_name}；"
                f"请在 backend/event_types/events.py 补上，或修正本脚本的命名约定"
            )
        _collect(model)

    return models


def _nested_models(annotation: Any) -> list[type[BaseModel]]:
    """从注解里递归挑出 pydantic 模型（含 list[X] / X | None 这类包装）"""
    if isinstance(annotation, type) and issubclass(annotation, BaseModel):
        return [annotation]

    found: list[type[BaseModel]] = []
    for arg in typing.get_args(annotation):
        found.extend(_nested_models(arg))
    return found


def generate() -> str:
    """生成 TS 源码（纯函数：--check 与写入共用同一份输出）。"""
    chunks: list[str] = [HEADER]

    # 1) 事件类型联合
    union = "\n".join(f"  | '{member.value}'" for member in EventType)
    chunks.append(f"export type EventType =\n{union}\n")

    # 2) payload 模型（先嵌套后事件，顺序稳定）
    for model in _payload_models():
        chunks.append(_render_model(model) + "\n")

    # 3) 事件 → payload 映射（前端 handler 可据此收窄）
    mapping = [f"  '{member.value}': {_pascal(member.name)}Data," for member in EventType]
    chunks.append("export interface EventPayloadMap {\n" + "\n".join(mapping) + "\n}\n")

    return "\n".join(chunks)


def check() -> int:
    """校验仓库里的文件是否与生成结果一致（不一致返回 1）。"""
    expected = generate()
    if not OUTPUT_PATH.exists():
        print(f"[gen-event-types] 缺少生成文件: {OUTPUT_PATH}")
        return 1
    actual = OUTPUT_PATH.read_text(encoding="utf-8")
    if actual != expected:
        print(
            "[gen-event-types] 生成文件已过期（后端事件模型改了但没重新生成）。\n"
            "  修复：cd backend && .venv/Scripts/python -m scripts.gen_event_types_ts"
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
        print(f"[gen-event-types] 无需更新: {OUTPUT_PATH}")
        return 0
    OUTPUT_PATH.write_text(content, encoding="utf-8", newline="\n")
    print(f"[gen-event-types] 已写入: {OUTPUT_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
