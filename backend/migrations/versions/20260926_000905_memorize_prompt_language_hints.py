"""memorize 教材增补：记忆存储语言 + 反幻觉条款（迁移即种子）

Revision ID: 20260926_000905
Revises: 20260926_000904
Create Date: 2026-09-27

删除身份事故（2026-09-27）的教材侧：记忆以英文第三人称陈述存储，模型
拿中文关键词 ILIKE 必然零命中，连搜四次全空后幻觉出「删除未能成功执行
——需在工具恢复后重新发起删除」的报告（实际从未调用 delete_memories）。

本批代码侧配套：tools/memory.py 的 search_memories 零命中自愈（附全部
清单 + 语言提示）。本迁移把教材两条增补下发到库（非动态行）：

1. 关键词必须匹配记忆的存储语言（中文指令 → 英文原文词；搜不到改用
   空关键词列全部）
2. 删除工具始终可用——严禁未调用 delete_memories 就声称删除失败/工具
   不可用（零匹配 ≠ 记忆不存在 ≠ 工具故障）

教材内容不复制进本文件：直接 import expert_config.EXPERT_DEFAULTS，
单一真相源。模式同 000903 / 000904。
"""

from collections.abc import Sequence
from datetime import datetime
from uuid import uuid4

from alembic import op
from sqlalchemy import bindparam, text

# revision identifiers, used by Alembic.
revision: str = "20260926_000905"
down_revision: str | None = "20260926_000904"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_PROMPT_SYNC_TARGETS = {"memorize_expert"}


def _now() -> str:
    return datetime.now().isoformat()


def upgrade() -> None:
    from expert_config import EXPERT_DEFAULTS

    conn = op.get_bind()

    for entry in EXPERT_DEFAULTS:
        expert_type = entry["expert_type"]

        if expert_type in _PROMPT_SYNC_TARGETS:
            conn.execute(
                text(
                    "UPDATE systemexpert SET system_prompt = :p, updated_at = :u, "
                    "config_version = config_version + 1 "
                    "WHERE expert_type = :t AND is_dynamic = false"
                ),
                {"p": entry["system_prompt"], "u": _now(), "t": expert_type},
            )
            print(f"[migration 000905] 教材下发: {expert_type}")

        # 全部内置专家 INSERT IF NOT EXISTS（幂等，迁移即种子）：不能只补
        # 变更的这个——空库跑完本迁移后表已非空，main.py 的空表自举会跳过
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

    # 内置标记归位（同 000903 兜底：只动内置清单内且非用户自建的行）
    _system_types = {e["expert_type"] for e in EXPERT_DEFAULTS}
    conn.execute(
        text(
            "UPDATE systemexpert SET is_dynamic = false, is_system = true "
            "WHERE expert_type IN :types AND is_dynamic = true"
        ).bindparams(bindparam("types", expanding=True)),
        {"types": sorted(_system_types)},
    )


def downgrade() -> None:
    # 教材回滚无价值（旧教材缺存储语言说明即事故源头）；补种行保留
    pass
