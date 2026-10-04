"""memorize_expert 教材更新：记忆改写指引（rewrite_memory 工具配套）

Revision ID: 20261004_000910
Revises: 20261004_000909
Create Date: 2026-10-04

记忆系统三项之一「记忆改写（把 XX 改成 YY）」：tools/memory.py 新增
rewrite_memory 闭包工具（精确改写单行 + 重嵌入 + created_at 刷新）。
本迁移只下发配套教材——没有教材的管理类工具有事故案底（2026-09-27
删除身份事故：模型误判工具状态、幻觉"删除失败"）：

- description 与 system_prompt 的管理段从「查看/删除」扩为「查看/删除/改写」
- 新增两条纪律：改写用原文定位（逐字复制，严禁编造 old_content）、
  操作报告不作为记忆入库
- 数据源直接 import expert_config（单一真相源，迁移不复制文案）；
  UPDATE 仅命中 is_dynamic=false 的内置行，用户自建行不碰
- 附带 INSERT IF NOT EXISTS：空表自举跳过的坑见 DECISIONS.md（缺行会让
  main.py 自举放弃，memorize_expert 永远缺失）

守卫式字面量 SQL，幂等重跑不炸。
"""

from collections.abc import Sequence
from datetime import datetime
from uuid import uuid4

from alembic import op
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision: str = "20261004_000910"
down_revision: str | None = "20261004_000909"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TARGET_EXPERT = "memorize_expert"


def upgrade() -> None:
    from expert_config import EXPERT_DEFAULTS

    conn = op.get_bind()
    entry = next(e for e in EXPERT_DEFAULTS if e["expert_type"] == TARGET_EXPERT)
    now = datetime.now().isoformat()

    updated = conn.execute(
        text(
            "UPDATE systemexpert SET system_prompt = :p, description = :d, "
            "updated_at = :u, config_version = config_version + 1 "
            "WHERE expert_type = :t AND is_dynamic = false"
        ),
        {"p": entry["system_prompt"], "d": entry.get("description"), "u": now, "t": TARGET_EXPERT},
    ).rowcount
    if updated:
        print(f"[migration 000910] {TARGET_EXPERT} 教材已更新（改写指引）")
    else:
        # 内置行不存在（如手工清库）：补种，避免空表自举跳过整批内置
        exists = conn.execute(
            text("SELECT 1 FROM systemexpert WHERE expert_type = :t"), {"t": TARGET_EXPERT}
        ).fetchone()
        if not exists:
            conn.execute(
                text(
                    "INSERT INTO systemexpert "
                    "(id, expert_type, name, description, system_prompt, model, "
                    "temperature, is_system, is_dynamic, config_version, created_at, updated_at) "
                    "VALUES (:id, :t, :n, :d, :p, :m, :tp, true, false, 1, :u, :u)"
                ),
                {
                    "id": str(uuid4()),
                    "t": TARGET_EXPERT,
                    "n": entry["name"],
                    "d": entry.get("description"),
                    "p": entry["system_prompt"],
                    "m": entry.get("model"),
                    "tp": entry.get("temperature"),
                    "u": now,
                },
            )
            print(f"[migration 000910] {TARGET_EXPERT} 缺行，已补种（含改写指引）")
        else:
            print(f"[migration 000910] {TARGET_EXPERT} 存在但非内置行（is_dynamic），跳过")


def downgrade() -> None:
    # 教材回滚没有意义（文案随代码演进）；改写工具本身向后兼容
    pass
