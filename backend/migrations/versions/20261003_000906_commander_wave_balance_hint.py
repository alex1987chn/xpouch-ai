"""commander 教材增补：波次均衡指引（迁移即种子）

Revision ID: 20261003_000906
Revises: 20260926_000905
Create Date: 2026-10-03

波次屏障的结构性代价（2026-10-03 架构审视）：调度按依赖波次推进，下一波
必须等上一波**全部**完成。规划把重任务与轻任务混进同一波时，轻任务的长尾
全部在陪跑一个慢任务（如 10 秒任务陪 5 分钟任务等 4 分 50 秒）。

对症的便宜药是规划侧指引而非重写调度（重写要放弃 checkpointer 的原生分支
检查点，代价不成比例）：教材核心约束加第 6 条 Wave Balance——同波任务工作量
均衡、大任务拆细用 depends_on 串行。

教材内容不复制进本文件：直接 import expert_config.EXPERT_DEFAULTS，
单一真相源。模式同 000903 / 000904 / 000905。
"""

from collections.abc import Sequence
from datetime import datetime
from uuid import uuid4

from alembic import op
from sqlalchemy import bindparam, text

# revision identifiers, used by Alembic.
revision: str = "20261003_000906"
down_revision: str | None = "20260926_000905"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_PROMPT_SYNC_TARGETS = {"commander"}


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
            print(f"[migration 000906] 教材下发: {expert_type}")

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

    # 内置标记归位（同 000903/000905 兜底：只动内置清单内且非用户自建的行）
    _system_types = {e["expert_type"] for e in EXPERT_DEFAULTS}
    conn.execute(
        text(
            "UPDATE systemexpert SET is_dynamic = false, is_system = true "
            "WHERE expert_type IN :types AND is_dynamic = true"
        ).bindparams(bindparam("types", expanding=True)),
        {"types": sorted(_system_types)},
    )


def downgrade() -> None:
    # 教材回滚无价值（缺波均衡指引即本迁移要修的缺口）；补种行保留
    pass
