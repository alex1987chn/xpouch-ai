"""新增 system_setting 系统级键值配置表

首个用途：全局默认模型偏好（simple_model / simple_thinking）从 env
(MODEL_NAME) 抬到 DB，管理员可在运行时经接口修改，无需重启。
后续 BYOK、通知开关等实例级配置复用此表。

注意：列清单为字面量（无外部输入），直接内联以通过安全扫描。

Revision ID: 20260910_000100
Revises: 20260909_000100
Create Date: 2026-09-10
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260910_000100"
down_revision: str | None = "20260909_000100"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "system_setting",
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("value", sa.Text(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("key"),
    )


def downgrade() -> None:
    op.drop_table("system_setting")
