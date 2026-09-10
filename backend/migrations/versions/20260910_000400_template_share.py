"""share_token 通用化：支持模板分享链接（增长回路）

- artifact_id 放开为可空（产物分享保持不变）
- 新增 template_key 列（可空，索引）：模板分享按 key 撤销/解析

Revision ID: 20260910_000400
Revises: 20260910_000300
Create Date: 2026-09-10
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260910_000400"
down_revision: str | None = "20260910_000300"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("share_token", "artifact_id", existing_type=sa.String(length=64), nullable=True)
    op.add_column("share_token", sa.Column("template_key", sa.String(length=128), nullable=True))
    op.create_index("ix_share_token_template_key", "share_token", ["template_key"])


def downgrade() -> None:
    op.drop_index("ix_share_token_template_key", table_name="share_token")
    op.drop_column("share_token", "template_key")
    # 有模板分享行存在时此语句会失败——先清理模板分享行再降级
    op.alter_column(
        "share_token", "artifact_id", existing_type=sa.String(length=64), nullable=False
    )
