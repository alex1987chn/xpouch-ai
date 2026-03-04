"""
枚举防回归：确保 DB 使用 .value 映射，避免存成 name。
见 code review 报告 3.3 / .ai/CHANGE_CONTRACT.md。
"""
import pytest

from models.enums import (
    ConversationType,
    ExecutionMode,
    ExpertType,
    TaskStatus,
    UserRole,
    _enum_values,
)


@pytest.mark.parametrize(
    "enum_cls",
    [
        UserRole,
        ConversationType,
        ExpertType,
        TaskStatus,
        ExecutionMode,
    ],
)
def test_enum_values_callable_matches_value(enum_cls):
    """每个 StrEnum 的 _enum_values() 必须等于 [m.value for m in enum]，保证 DB 存 value 不存 name。"""
    expected = [m.value for m in enum_cls]
    actual = _enum_values(enum_cls)
    assert actual == expected, (
        f"{enum_cls.__name__}: _enum_values 应与 .value 一致，"
        f"got {actual!r} vs expected {expected!r}"
    )


def test_enum_values_are_lowercase_or_snake():
    """约定：枚举 value 为小写或 snake_case，便于 DB/API 一致。"""
    for enum_cls in (UserRole, ConversationType, ExpertType, TaskStatus, ExecutionMode):
        for member in enum_cls:
            val = member.value
            assert val == val.lower() or "_" in val, (
                f"{enum_cls.__name__}.{member.name}.value = {val!r} 应为小写或 snake_case"
            )
