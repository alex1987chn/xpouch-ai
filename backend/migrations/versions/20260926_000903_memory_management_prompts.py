"""记忆删除能力：memorize/router/commander 教材下发（含迁移即种子）

Revision ID: 20260926_000903
Revises: 20260924_000902
Create Date: 2026-09-26

记忆删除能力（2026-09-26）的教材侧：此前 MemoryManager 无删除方法，
用户说"删除记忆"无链路承接——AI 只能口头答应（历史上有条记忆的内容
就是"已为您删除所有苹果记忆"，实际什么都没发生）。

本批代码侧配套：tools/memory.py（闭包工具，user_id 服务端注入）、
tool_policy 注册（allowed_experts=memorize_expert）、generic 工具注入
与"用过记忆工具跳过逐行入库"护栏。本迁移只管教材：

1. memorize_expert：新增 Memory Management 节——删除/查看任务走工具
   （先 search_memories 预览后 delete_memories），输出操作报告而非记忆行
2. router：Complex 模式规则补"删除/查看/管理记忆"类指令
3. commander：特殊场景处理补记忆管理指令归口 memorize_expert

不动：is_dynamic=true 的用户自建专家；expert_type 标识符。
教材内容不复制进本文件：直接 import expert_config.EXPERT_DEFAULTS，
单一真相源。
"""

from collections.abc import Sequence
from datetime import datetime
from uuid import uuid4

from alembic import op
from sqlalchemy import bindparam, text

# revision identifiers, used by Alembic.
revision: str = "20260926_000903"
down_revision: str | None = "20260924_000902"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# 本批教材有实质变更、需要覆盖下发的专家
_PROMPT_SYNC_TARGETS = {"memorize_expert", "router", "commander"}


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
            print(f"[migration 000903] 教材下发: {expert_type}")

        # 全部内置专家 INSERT IF NOT EXISTS（幂等，迁移即种子）：不能只补
        # 变更的三个——空库跑完本迁移后表已非空，main.py 的空表自举会跳过
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

    # 内置标记归位（同 000800 的兜底：只动内置清单内且非用户自建的行）
    _system_types = {e["expert_type"] for e in EXPERT_DEFAULTS}
    conn.execute(
        text(
            "UPDATE systemexpert SET is_dynamic = false, is_system = true "
            "WHERE expert_type IN :types AND is_dynamic = true"
        ).bindparams(bindparam("types", expanding=True)),
        {"types": sorted(_system_types)},
    )


def downgrade() -> None:
    # 教材回滚无价值（旧教材缺删除协议，回退即功能残废）；补种行保留
    pass
