"""事件协议生成物必须是最新的（决定 6 的第一道闸门）。

真相源 = `backend/event_types/events.py`（EventType 枚举 + 各事件的 pydantic 模型）。
`frontend/src/types/events.generated.ts` 由 `scripts/gen_event_types_ts.py` 生成。

改协议忘了重新生成 → 这条测试失败（附修复命令）。前端那边还有第二道闸门：
`frontend/src/types/events.ts` 里每条手写类型与生成类型做字段子集断言，tsc 会挡。
"""

from __future__ import annotations

from scripts import gen_event_types_ts


def test_generated_ts_is_fresh():
    assert gen_event_types_ts.check() == 0, (
        "frontend/src/types/events.generated.ts 与后端事件模型不一致；"
        "跑 `just gen-event-types`（或 `cd backend && uv run python -m scripts.gen_event_types_ts`）重新生成"
    )


def test_every_event_type_has_payload_model():
    """每个 EventType 都必须有对应 payload 模型（新增事件类型不能只加枚举）。"""
    models = gen_event_types_ts._payload_models()
    names = {m.__name__ for m in models}

    for member in gen_event_types_ts.EventType:
        expected = f"{gen_event_types_ts._pascal(member.name)}Data"
        assert expected in names, f"{member.value} 缺少 {expected}"


def test_generator_output_is_deterministic():
    """同一份模型生成两次必须逐字节一致（否则漂移闸门会随机红）。"""
    assert gen_event_types_ts.generate() == gen_event_types_ts.generate()
