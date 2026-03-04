# Services Module
"""
业务逻辑服务层。

避免在包导入阶段触发重量级依赖（例如 graph / LLM 初始化链路），
通过 __getattr__ 做懒加载，降低循环导入风险。
"""

from __future__ import annotations

from typing import Any

__all__ = ["InvokeService", "get_invoke_service"]


def __getattr__(name: str) -> Any:
    if name in {"InvokeService", "get_invoke_service"}:
        from .invoke_service import InvokeService, get_invoke_service

        exports = {
            "InvokeService": InvokeService,
            "get_invoke_service": get_invoke_service,
        }
        return exports[name]
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
