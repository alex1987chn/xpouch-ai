"""Add deadline_at to agentrun for runtime deadline control.

Revision ID: 20260308_113000
Revises: 20260307_160000
Create Date: 2026-03-08 11:30:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision: str = "20260308_113000"
down_revision: str | None = "20260307_160000"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = inspect(conn)
    columns = {column["name"] for column in inspector.get_columns("agentrun")}
    if "deadline_at" not in columns:
        op.add_column("agentrun", sa.Column("deadline_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    conn = op.get_bind()
    inspector = inspect(conn)
    columns = {column["name"] for column in inspector.get_columns("agentrun")}
    if "deadline_at" in columns:
        op.drop_column("agentrun", "deadline_at")
