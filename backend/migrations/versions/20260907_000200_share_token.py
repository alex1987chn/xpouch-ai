"""share_token 表：单产物分享令牌

产物分享（B2）：用户可为单个 artifact 生成只读公开链接（/s/{token}）。
明文 token 仅在创建响应返回一次，库中只存 SHA-256 哈希；撤销 = revoked_at。

Revision ID: 20260907_000200
Revises: 20260907_000100
Create Date: 2026-09-07
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260907_000200"
down_revision: str | None = "20260907_000100"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "share_token",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column(
            "artifact_id",
            sa.String(64),
            sa.ForeignKey("artifact.id"),
            nullable=False,
            index=True,
        ),
        # SHA-256 hex（64 字符），唯一
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True, index=True),
        sa.Column("created_by", sa.String(64), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("share_token")
