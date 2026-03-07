"""
统一错误码定义。

目标：
- 避免字符串错误码散落在各模块
- 让 API 错误码、SSE 错误事件码语义一致
"""

from __future__ import annotations

from enum import StrEnum


class ErrorCode(StrEnum):
    """项目统一错误码集合。"""

    INTERNAL_ERROR = "INTERNAL_ERROR"
    VALIDATION_ERROR = "VALIDATION_ERROR"
    AUTHENTICATION_ERROR = "AUTHENTICATION_ERROR"
    AUTHORIZATION_ERROR = "AUTHORIZATION_ERROR"
    NOT_FOUND = "NOT_FOUND"
    LLM_ERROR = "LLM_ERROR"
    DATABASE_ERROR = "DATABASE_ERROR"
    EXTERNAL_SERVICE_ERROR = "EXTERNAL_SERVICE_ERROR"
    RATE_LIMIT = "RATE_LIMIT"

    PLAN_VERSION_CONFLICT = "PLAN_VERSION_CONFLICT"
    RESUME_IN_PROGRESS = "RESUME_IN_PROGRESS"
    RESUME_DUPLICATE_REQUEST = "RESUME_DUPLICATE_REQUEST"
    RUN_CANCELLED = "RUN_CANCELLED"

    STREAM_ERROR = "STREAM_ERROR"
    GRAPH_ERROR = "GRAPH_ERROR"
    RESUME_ERROR = "RESUME_ERROR"
    TOOL_CALL_TIMEOUT = "TOOL_CALL_TIMEOUT"
    TOOL_CALL_ERROR = "TOOL_CALL_ERROR"
    LOOP_GUARD_TRIGGERED = "LOOP_GUARD_TRIGGERED"


def as_error_code(code: str | ErrorCode) -> str:
    """将字符串或枚举统一转换为字符串错误码。"""
    if isinstance(code, ErrorCode):
        return code.value
    return code
