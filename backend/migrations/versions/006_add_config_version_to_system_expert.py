"""add_config_version_to_system_expert

Revision ID: 006
Revises: 20260304_180000
Create Date: 2026-03-04 15:30:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision: str = "006"
down_revision: str | None = "20260304_180000"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def column_exists(conn, table_name, column_name):
    """检查列是否存在"""
    inspector = inspect(conn)
    columns = [col["name"] for col in inspector.get_columns(table_name)]
    return column_name in columns


def upgrade() -> None:
    """Add config_version column to SystemExpert for optimistic locking."""
    conn = op.get_bind()

    if not column_exists(conn, "systemexpert", "config_version"):
        op.add_column(
            "systemexpert",
            sa.Column("config_version", sa.Integer(), nullable=True, server_default="0"),
        )


def downgrade() -> None:
    """Remove config_version column from SystemExpert."""
    conn = op.get_bind()

    if column_exists(conn, "systemexpert", "config_version"):
        op.drop_column("systemexpert", "config_version")
