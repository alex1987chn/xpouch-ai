"""时区统一：user.created_at 存量为本地时间(UTC+8)写入 → 平移为 UTC

历史写入路径（OTP 注册 / 管理员创建）均走模型默认值 datetime.now()（本地
墙钟），与其他表的 UTC naive 约定不一致。本迁移一次性 +8 小时对齐；
前提：部署环境时区为 UTC+8（当前所有已知部署均如此）。

Revision ID: 20260912_000300
Revises: 20260912_000200
Create Date: 2026-09-12
"""

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260912_000300"
down_revision: str | None = "20260912_000200"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "UPDATE \"user\" SET created_at = created_at + INTERVAL '8 hours' WHERE created_at IS NOT NULL"
    )


def downgrade() -> None:
    op.execute(
        "UPDATE \"user\" SET created_at = created_at - INTERVAL '8 hours' WHERE created_at IS NOT NULL"
    )
