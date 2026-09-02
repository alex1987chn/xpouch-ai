"""add user settings table

Revision ID: 20260902_120000
Revises: 20260317_200000_ensure_task_status_enum_complete
Create Date: 2026-09-02 12:00:00
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.engine import Connection
from sqlalchemy.engine.reflection import Inspector

# revision identifiers, used by Alembic.
revision: str = "20260902_120000"
down_revision: str | None = "20260317_200000"
branch_labels: str | None = None
depends_on: str | None = None


def _table_exists(conn: Connection, table_name: str) -> bool:
    return Inspector.from_engine(conn).has_table(table_name)


def upgrade() -> None:
    conn = op.get_bind()

    if not _table_exists(conn, "user_settings"):
        op.create_table(
            "user_settings",
            sa.Column("user_id", sa.String(length=255), nullable=False),
            sa.Column("preferences", sa.JSON(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
            sa.PrimaryKeyConstraint("user_id"),
        )


def downgrade() -> None:
    conn = op.get_bind()

    if _table_exists(conn, "user_settings"):
        op.drop_table("user_settings")
