"""内置专家显示名收敛（LangGraph 角色化命名）+ 提示词自称同步

Revision ID: 20260924_000800
Revises: 20260923_000700
Create Date: 2026-09-24

改名内容（代码侧 EXPERT_DEFAULTS 已改，本迁移把已部署库同步到同款）：
- commander 任务指挥官 → 编排专家（LangGraph orchestrator-worker 模式：拆任务+定依赖
  即 orchestrator 职责；提示词自称同步改为「智能任务编排器（Orchestrator）」）
- aggregator 首席联络官 → 汇总专家（多智能体产出综合角色的通用称谓；提示词自称
  同步改为「汇总专家（Synthesizer）」）
- router 意图路由 → 意图识别专家（zh 回归「X专家」家族；en 词条保留 Intent Router）
- memorize_expert 记忆助理 → 记忆专家（与其余内置专家命名家族一致）

不动的：
- expert_type 标识符一律不改——canonical 词汇（docs/DECISIONS.md），被
  executionplan/agentrun 历史数据与代码引用，改名属高风险零收益
- is_dynamic=true 的行（用户自建专家）一律不碰——用户内容不是系统教材

教材内容不复制进本文件：直接 import expert_config.EXPERT_DEFAULTS
（迁移运行环境已含 backend 根于 sys.path），单一真相源。
"""

from collections.abc import Sequence
from datetime import datetime
from uuid import uuid4

from alembic import op
from sqlalchemy import bindparam, text

# revision identifiers, used by Alembic.
revision: str = "20260924_000800"
down_revision: str | None = "20260923_000700"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# 提示词自称随显示名联动修改、需要覆盖下发的专家（config_version +1 走教材口径）
_PROMPT_SYNC_TARGETS = {"commander", "aggregator"}


def _now() -> str:
    return datetime.now().isoformat()


def upgrade() -> None:
    from expert_config import EXPERT_DEFAULTS

    conn = op.get_bind()

    for entry in EXPERT_DEFAULTS:
        expert_type = entry["expert_type"]

        # 显示名 + （如属提示词自称联动的专家）教材下发。只覆盖 is_dynamic=false
        # 的内置行；name 变更只动 updated_at，config_version 仅在教材变更时 +1
        if expert_type in _PROMPT_SYNC_TARGETS:
            conn.execute(
                text(
                    "UPDATE systemexpert SET name = :n, system_prompt = :p, "
                    "updated_at = :u, config_version = config_version + 1 "
                    "WHERE expert_type = :t AND is_dynamic = false"
                ),
                {
                    "n": entry["name"],
                    "p": entry["system_prompt"],
                    "u": _now(),
                    "t": expert_type,
                },
            )
        else:
            conn.execute(
                text(
                    "UPDATE systemexpert SET name = :n, updated_at = :u "
                    "WHERE expert_type = :t AND is_dynamic = false"
                ),
                {"n": entry["name"], "u": _now(), "t": expert_type},
            )

        # 全部内置专家 INSERT IF NOT EXISTS（幂等，迁移即种子）：不能只同步改名的
        # 四个——空库跑完本迁移后表已非空，main.py 的"空表才灌种"自举会判定已
        # 初始化而跳过，其余专家就永远缺失了
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

    # 内置标记归位（同 20260923_000200 的兜底：只动内置清单内且非用户自建的行）
    _system_types = {e["expert_type"] for e in EXPERT_DEFAULTS}
    conn.execute(
        text(
            "UPDATE systemexpert SET is_dynamic = false, is_system = true "
            "WHERE expert_type IN :types AND is_dynamic = true"
        ).bindparams(bindparam("types", expanding=True)),
        {"types": sorted(_system_types)},
    )


def downgrade() -> None:
    # 显示名回滚无价值（旧名是待修正项），旧提示词同样；补种行保留——本就该存在
    pass
