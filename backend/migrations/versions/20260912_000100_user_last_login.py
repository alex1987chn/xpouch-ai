"""用户管理：新增 last_login_at（最近一次登录时间）

- user 表加可空时间戳列；历史用户为 NULL（"从未记录"，前端显示 —）
- 登录链路（OTP verify-code / login-password）负责写入

Revision ID: 20260912_000100
Revises: 20260910_000400
Create Date: 2026-09-12
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260912_000100"
down_revision: str | None = "20260910_000400"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("user", sa.Column("last_login_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("user", "last_login_at")
