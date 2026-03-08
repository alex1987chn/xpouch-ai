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
    def __init__(self) -> None:
        self._cache: dict[tuple[str, str], ToolPolicyOverride] = {}
        self._cache_expire_at = datetime.min.replace(tzinfo=UTC)
        self._cache_lock = asyncio.Lock()

    async def get_overrides(self) -> dict[tuple[str, str], ToolPolicyOverride]:
        now = datetime.now(UTC)
        if now < self._cache_expire_at:
            return self._cache
        async with self._cache_lock:
            now = datetime.now(UTC)
            if now < self._cache_expire_at:
                return self._cache
            overrides = await asyncio.to_thread(self._load_overrides_sync)
            self._cache = overrides
            self._cache_expire_at = now + timedelta(seconds=30)
            return overrides

    async def invalidate(self) -> None:
        async with self._cache_lock:
            self._cache = {}
            self._cache_expire_at = datetime.min.replace(tzinfo=UTC)

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
