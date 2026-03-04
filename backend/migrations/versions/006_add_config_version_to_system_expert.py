"""add_config_version_to_system_expert

Revision ID: 006
Revises: 20260304_180000
Create Date: 2026-03-04 15:30:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "006"
down_revision: str | None = "20260304_180000"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add config_version column to SystemExpert for optimistic locking."""
    op.add_column(
        "systemexpert",
        sa.Column("config_version", sa.Integer(), nullable=True, server_default="0")
    )


def downgrade() -> None:
    """Remove config_version column from SystemExpert."""
    op.drop_column("systemexpert", "config_version")
