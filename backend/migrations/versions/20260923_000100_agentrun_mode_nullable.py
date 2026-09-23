"""agentrun.mode 改可空——路由决策前终止的 run 不再写占位值 "router"

Revision ID: 20260923_000100
Revises: 20260922_000200
Create Date: 2026-09-23

背景：run 出生时路由决策尚未发生，此前写占位值 "router"，决策后更新为
simple/complex；**决策前终止的 run**（立即停止/断流/进程重启）永远停在
"router"，被统计接口的 Literal["simple","complex"] 契约拒收——一条坏行
炸整个运行统计响应。语义修正：没决策就是 NULL，不是第三种模式。

内容：
1. agentrun.mode 列 DROP NOT NULL（索引不受影响）
2. 存量清洗：mode='router' -> NULL（15 行，本 dev 库实测值）

⚠️ 守卫说明：列存在性判断——空库链从 001 起就该有该列，但按仓库惯例
DDL 一律守卫式字面量 SQL，兼容历史分叉。
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260923_000100"
down_revision: str | None = "20260922_000200"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 列存在才动（守卫式）
    op.execute(
        "DO $$ BEGIN "
        "IF EXISTS (SELECT 1 FROM information_schema.columns "
        "WHERE table_name='agentrun' AND column_name='mode') THEN "
        "ALTER TABLE agentrun ALTER COLUMN mode DROP NOT NULL; "
        "UPDATE agentrun SET mode = NULL WHERE mode = 'router'; "
        "END IF; "
        "END $$;"
    )


def downgrade() -> None:
    # 反向：NULL 回填占位值并恢复 NOT NULL（回到"假数据填没发生的事实"的旧行为）
    op.execute(
        "DO $$ BEGIN "
        "IF EXISTS (SELECT 1 FROM information_schema.columns "
        "WHERE table_name='agentrun' AND column_name='mode') THEN "
        "UPDATE agentrun SET mode = 'router' WHERE mode IS NULL; "
        "ALTER TABLE agentrun ALTER COLUMN mode SET NOT NULL; "
        "END IF; "
        "END $$;"
    )
