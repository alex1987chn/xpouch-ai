"""
工具策略缓存服务
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlmodel import Session, select

from database import engine
from models import ToolPolicy
from utils.time import utc_now


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

    ⚠️ 时间基准必须与 `utc_now()` 一致（aware UTC，2026-09-22 起全链路 aware）。
    历史教训：本项目曾两度因 naive/aware 混用在此翻车——先有 aware 基准撞
    naive 的 now（TypeError → get_overrides() 每次失败 → 被 generic 的宽
    except 吞掉 → **所有专家的工具调用静默失效**），aware 化后又须把基准
    一起翻成 aware。结论：任何"过期基准哨兵值"必须随全局时间策略同步改，
    见 docs/TARGET-ARCHITECTURE.md 的时区约定。
    """

    def __init__(self) -> None:
        self._cache: dict[tuple[str, str], ToolPolicyOverride] = {}
        self._cache_expire_at = datetime.min.replace(tzinfo=UTC)  # aware，与 utc_now() 同基准
        self._cache_lock = asyncio.Lock()

    async def get_overrides(self) -> dict[tuple[str, str], ToolPolicyOverride]:
        now = utc_now()
        if now < self._cache_expire_at:
            return self._cache
        async with self._cache_lock:
            now = utc_now()
            if now < self._cache_expire_at:
                return self._cache
            overrides = await asyncio.to_thread(self._load_overrides_sync)
            self._cache = overrides
            self._cache_expire_at = now + timedelta(seconds=30)
            return overrides

    async def invalidate(self) -> None:
        async with self._cache_lock:
            self._cache = {}
            self._cache_expire_at = datetime.min.replace(tzinfo=UTC)  # aware，见类 docstring

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
