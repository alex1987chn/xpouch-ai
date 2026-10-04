"""专家语义从人设改能力包（迁移即种子）

Revision ID: 20261003_000907
Revises: 20261003_000906
Create Date: 2026-10-03

2026-10-03 架构审视结论：预设的「专家人设」（你是一名资深/世界级的…）
对客观任务无增益（EMNLP 2024 persona 实证），行业已收敛到「能力包」——
专家 = 工具集 + 领域知识 + 输出契约 + 边界。本次只换框架语义（换头不换身）：

1. description 全面改写为能力契约（输入 → 产出 → 适用条件）。这是
   commander 匹配的唯一文本面（{dynamic_expert_list} 注入的就是它），
   也是管理台的展示文案——匹配语义从「派给谁」变成「选哪套能力」。
2. 教材开头的人设叙事（# Role）换成能力包框架（# Capability Pack），
   事故换来的协议正文逐字保留（memorize 反幻觉条款、router 镜像规则、
   aggregator 格式透传——均为血案产物，动它们必须过各自闸门测试）。
3. commander 教材：「可用专家资源/Expert Matching/分配」话术改为
   「可用能力包/Pack Matching/选用」，匹配依据明示为能力契约。

expert_type 标识符不动（历史数据耦合，见 DECISIONS 词汇收敛）；
用户自建专家（is_dynamic=true）不受影响。display name「X专家」家族
保留——persona 降级为纯 UX 识别层。

教材内容不复制进本文件：直接 import expert_config.EXPERT_DEFAULTS，
单一真相源。模式同 000903-000906。
"""

from collections.abc import Sequence
from datetime import datetime
from uuid import uuid4

from alembic import op
from sqlalchemy import bindparam, text

# revision identifiers, used by Alembic.
revision: str = "20261003_000907"
down_revision: str | None = "20261003_000906"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _now() -> str:
    return datetime.now().isoformat()


def upgrade() -> None:
    from expert_config import EXPERT_DEFAULTS

    conn = op.get_bind()

    for entry in EXPERT_DEFAULTS:
        expert_type = entry["expert_type"]

        # 全部内置都改写（description + system_prompt）；用户自建行不碰
        conn.execute(
            text(
                "UPDATE systemexpert SET system_prompt = :p, description = :d, "
                "updated_at = :u, config_version = config_version + 1 "
                "WHERE expert_type = :t AND is_dynamic = false"
            ),
            {
                "p": entry["system_prompt"],
                "d": entry.get("description"),
                "u": _now(),
                "t": expert_type,
            },
        )
        print(f"[migration 000907] 能力包语义下发: {expert_type}")

        # 全部内置专家 INSERT IF NOT EXISTS（幂等，迁移即种子）：不能只补
        # 变更的——空库跑完本迁移后表已非空，main.py 的空表自举会跳过
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

    # 内置标记归位（同 000903/000906 兜底：只动内置清单内且非用户自建的行）
    _system_types = {e["expert_type"] for e in EXPERT_DEFAULTS}
    conn.execute(
        text(
            "UPDATE systemexpert SET is_dynamic = false, is_system = true "
            "WHERE expert_type IN :types AND is_dynamic = true"
        ).bindparams(bindparam("types", expanding=True)),
        {"types": sorted(_system_types)},
    )


def downgrade() -> None:
    # 教材回滚无价值（旧人设文案即本次要替换的对象）；补种行保留
    pass
