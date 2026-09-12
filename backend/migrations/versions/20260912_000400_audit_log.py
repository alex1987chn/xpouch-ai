"""审计日志：新增 auditlog 表（管理面关键变更留痕）

Revision ID: 20260912_000400
Revises: 20260912_000300
Create Date: 2026-09-12
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260912_000400"
down_revision: str | None = "20260912_000300"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "auditlog",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("actor_user_id", sa.String(length=64), nullable=True),
        sa.Column("actor_username", sa.String(length=50), nullable=False),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("target", sa.String(length=128), nullable=True),
        sa.Column("detail", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_auditlog_actor_user_id", "auditlog", ["actor_user_id"])
    op.create_index("ix_auditlog_actor_username", "auditlog", ["actor_username"])
    op.create_index("ix_auditlog_action", "auditlog", ["action"])
    op.create_index("ix_auditlog_target", "auditlog", ["target"])
    op.create_index("ix_auditlog_created", "auditlog", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_auditlog_created", table_name="auditlog")
    op.drop_index("ix_auditlog_target", table_name="auditlog")
    op.drop_index("ix_auditlog_action", table_name="auditlog")
    op.drop_index("ix_auditlog_actor_username", table_name="auditlog")
    op.drop_index("ix_auditlog_actor_user_id", table_name="auditlog")
    op.drop_table("auditlog")
