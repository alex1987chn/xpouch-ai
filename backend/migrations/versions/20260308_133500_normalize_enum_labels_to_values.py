"""Normalize legacy PostgreSQL enum labels to current lowercase values.

Revision ID: 20260308_133500
Revises: 20260308_113000
Create Date: 2026-03-08 13:35:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260308_133500"
down_revision: str | None = "20260308_113000"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _get_enum_labels(conn, enum_name: str) -> set[str]:
    rows = conn.execute(
        sa.text(
            """
            SELECT e.enumlabel
            FROM pg_type t
            JOIN pg_enum e ON t.oid = e.enumtypid
            WHERE t.typname = :enum_name
            """
        ),
        {"enum_name": enum_name},
    ).fetchall()
    return {row[0] for row in rows}


def _rename_enum_label_if_needed(conn, enum_name: str, old_label: str, new_label: str) -> None:
    labels = _get_enum_labels(conn, enum_name)
    if old_label not in labels or new_label in labels:
        return

    conn.execute(sa.text(f"ALTER TYPE {enum_name} RENAME VALUE '{old_label}' TO '{new_label}'"))


def upgrade() -> None:
    conn = op.get_bind()

    rename_pairs: dict[str, tuple[tuple[str, str], ...]] = {
        "user_role_enum": (
            ("USER", "user"),
            ("ADMIN", "admin"),
            ("VIEW_ADMIN", "view_admin"),
            ("EDIT_ADMIN", "edit_admin"),
        ),
        "conversation_type_enum": (
            ("DEFAULT", "default"),
            ("CUSTOM", "custom"),
            ("AI", "ai"),
        ),
        "task_status_enum": (
            ("PENDING", "pending"),
            ("RUNNING", "running"),
            ("COMPLETED", "completed"),
            ("FAILED", "failed"),
            ("CANCELLED", "cancelled"),
        ),
        "execution_mode_enum": (
            ("SEQUENTIAL", "sequential"),
            ("PARALLEL", "parallel"),
        ),
    }

    for enum_name, pairs in rename_pairs.items():
        for old_label, new_label in pairs:
            _rename_enum_label_if_needed(conn, enum_name, old_label, new_label)


def downgrade() -> None:
    conn = op.get_bind()

    rename_pairs: dict[str, tuple[tuple[str, str], ...]] = {
        "user_role_enum": (
            ("user", "USER"),
            ("admin", "ADMIN"),
            ("view_admin", "VIEW_ADMIN"),
            ("edit_admin", "EDIT_ADMIN"),
        ),
        "conversation_type_enum": (
            ("default", "DEFAULT"),
            ("custom", "CUSTOM"),
            ("ai", "AI"),
        ),
        "task_status_enum": (
            ("pending", "PENDING"),
            ("running", "RUNNING"),
            ("completed", "COMPLETED"),
            ("failed", "FAILED"),
            ("cancelled", "CANCELLED"),
        ),
        "execution_mode_enum": (
            ("sequential", "SEQUENTIAL"),
            ("parallel", "PARALLEL"),
        ),
    }

    for enum_name, pairs in rename_pairs.items():
        for old_label, new_label in pairs:
            _rename_enum_label_if_needed(conn, enum_name, old_label, new_label)
