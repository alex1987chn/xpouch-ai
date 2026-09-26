"""路由归一：router 教材补确定性规则镜像词（最新/出行）

Revision ID: 20260926_000904
Revises: 20260926_000903
Create Date: 2026-09-26

路由口径镜像闸门（tests/test_routing_rules.py）首跑即抓到的真实缺口：
确定性兜底规则里有实时数据（含"最新"字样）和出行路线两类，router 教材
却从未提及——LLM 从不知道这两类该走 complex，全靠代码兜底硬扛。本迁移
把教材补齐（与 agents/routing_rules.py 的 FORCED_COMPLEX_RULES 镜像）。

教材内容不复制进本文件：直接 import expert_config.EXPERT_DEFAULTS，
单一真相源。
"""

from collections.abc import Sequence
from datetime import datetime
from uuid import uuid4

from alembic import op
from sqlalchemy import bindparam, text

# revision identifiers, used by Alembic.
revision: str = "20260926_000904"
down_revision: str | None = "20260926_000903"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _now() -> str:
    return datetime.now().isoformat()


def upgrade() -> None:
    from expert_config import EXPERT_DEFAULTS

    conn = op.get_bind()

    for entry in EXPERT_DEFAULTS:
        expert_type = entry["expert_type"]

        if expert_type == "router":
            conn.execute(
                text(
                    "UPDATE systemexpert SET system_prompt = :p, updated_at = :u, "
                    "config_version = config_version + 1 "
                    "WHERE expert_type = :t AND is_dynamic = false"
                ),
                {"p": entry["system_prompt"], "u": _now(), "t": expert_type},
            )
            print("[migration 000904] 教材下发: router（补镜像词）")

        # 迁移即种子（幂等）
        exists = conn.execute(
            text("SELECT 1 FROM systemexpert WHERE expert_type = :t"),
            {"t": expert_type},
        ).fetchone()
        if not exists:
            conn.execute(
                text(
                    "INSERT INTO systemexpert "
                    "(id, expert_type, name, description, system_prompt, model, "
                    "temperature, is_dynamic, is_system, config_version, "
                    "created_at, updated_at) "
                    "VALUES (:id, :t, :n, :d, :p, :m, :tp, false, true, 0, :u, :u)"
                ),
                {
                    "id": str(uuid4()),
                    "t": expert_type,
                    "n": entry["name"],
                    "d": entry.get("description"),
                    "p": entry["system_prompt"],
                    "m": entry.get("model", "deepseek-flash"),
                    "tp": entry.get("temperature", 0.5),
                    "u": _now(),
                },
            )

    _system_types = {e["expert_type"] for e in EXPERT_DEFAULTS}
    conn.execute(
        text(
            "UPDATE systemexpert SET is_dynamic = false, is_system = true "
            "WHERE expert_type IN :types AND is_dynamic = true"
        ).bindparams(bindparam("types", expanding=True)),
        {"types": sorted(_system_types)},
    )


def downgrade() -> None:
    pass
