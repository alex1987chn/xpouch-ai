"""
工具策略缓存服务
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlmodel import Session, select

from database import engine
from models import ToolPolicy
from utils.time import utc_now_naive


@dataclass(frozen=True)
class ToolPolicyOverride:
    tool_name: str
    source: str
    enabled: bool
    risk_tier: str
    approval_required: bool
    allowed_experts: tuple[str, ...]
    blocked_experts: tuple[str, ...]
    policy_note: str | None


class ToolPolicyService:
    """工具策略覆盖的进程内缓存（TTL 30s）。

    ⚠️ 时间基准必须与 `utc_now_naive()` 一致（naive UTC）。
    这里曾写成 `datetime.min.replace(tzinfo=UTC)`（aware），与 naive 的 now 比较
    会抛 TypeError → `get_overrides()` 每次都失败 → 被 generic 的宽 except 吞掉、
    记为「工具绑定失败」→ **所有专家的工具调用静默失效**
    （自引入至 2026-09-13 修复）。naive/aware 混用是本项目已发生多次的坑，
    见 docs/TARGET-ARCHITECTURE.md 的时区约定。
    """

    def __init__(self) -> None:
        self._cache: dict[tuple[str, str], ToolPolicyOverride] = {}
        self._cache_expire_at = datetime.min  # naive，与 utc_now_naive() 同基准
        self._cache_lock = asyncio.Lock()

    async def get_overrides(self) -> dict[tuple[str, str], ToolPolicyOverride]:
        now = utc_now_naive()
        if now < self._cache_expire_at:
            return self._cache
        async with self._cache_lock:
            now = utc_now_naive()
            if now < self._cache_expire_at:
                return self._cache
            overrides = await asyncio.to_thread(self._load_overrides_sync)
            self._cache = overrides
            self._cache_expire_at = now + timedelta(seconds=30)
            return overrides

    async def invalidate(self) -> None:
        async with self._cache_lock:
            self._cache = {}
            self._cache_expire_at = datetime.min  # naive，见类 docstring

    def _load_overrides_sync(self) -> dict[tuple[str, str], ToolPolicyOverride]:
        with Session(engine) as session:
            records = session.exec(select(ToolPolicy)).all()
        return {
            (record.tool_name, record.source): ToolPolicyOverride(
                tool_name=record.tool_name,
                source=record.source,
                enabled=record.enabled,
                risk_tier=record.risk_tier,
                approval_required=record.approval_required,
                allowed_experts=tuple(record.allowed_experts or ()),
                blocked_experts=tuple(record.blocked_experts or ()),
                policy_note=record.policy_note,
            )
            for record in records
        }


tool_policy_service = ToolPolicyService()
