"""Ensure task_status_enum contains all required values and executionplan.status uses it.

Revision ID: 20260317_200000
Revises: 20260313_120000
Create Date: 2026-03-17

Problem: task_status_enum might be missing 'cancelled' value,
causing cancel_run to fail with:
    invalid input value for enum task_status_enum: "cancelled"

This migration ensures:
1. task_status_enum contains all required values
2. executionplan.status column uses task_status_enum (not VARCHAR)

Root cause: executionplan was renamed from tasksession, but the status column
might not have been properly migrated to use the enum type.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260317_200000"
down_revision: str | None = "20260313_120000"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _enum_value_exists(conn, enum_name: str, value: str) -> bool:
    """Check if an enum value exists."""
    result = conn.execute(
        sa.text(
            """
            SELECT EXISTS (
                SELECT 1 FROM pg_enum e
                JOIN pg_type t ON e.enumtypid = t.oid
                WHERE t.typname = :enum_name AND e.enumlabel = :value
            )
            """
        ),
        {"enum_name": enum_name, "value": value},
    )
    return result.scalar()


def _add_enum_value_if_missing(conn, enum_name: str, value: str) -> None:
    """Add an enum value if it doesn't exist."""
    if not _enum_value_exists(conn, enum_name, value):
        conn.execute(sa.text(f"ALTER TYPE {enum_name} ADD VALUE IF NOT EXISTS '{value}'"))
        print(f"Added value '{value}' to {enum_name}")


def _column_uses_enum(conn, table_name: str, column_name: str, enum_name: str) -> bool:
    """Check if a column uses a specific enum type."""
    result = conn.execute(
        sa.text(
            """
            SELECT t.typname = :enum_name
            FROM pg_attribute a
            JOIN pg_class c ON a.attrelid = c.oid
            JOIN pg_type t ON a.atttypid = t.oid
            WHERE c.relname = :table_name
              AND a.attname = :column_name
              AND NOT a.attisdropped
            """
        ),
        {"table_name": table_name, "column_name": column_name, "enum_name": enum_name},
    )
    row = result.fetchone()
    return row[0] if row else False


def _migrate_column_to_enum(
    conn,
    table_name: str,
    column_name: str,
    enum_name: str,
    allowed_values: tuple[str, ...],
    fallback: str,
) -> None:
    """Migrate a VARCHAR column to ENUM type."""
    allowed_sql = ", ".join(f"'{v}'" for v in allowed_values)

    # Drop default first
    conn.execute(sa.text(f'ALTER TABLE "{table_name}" ALTER COLUMN {column_name} DROP DEFAULT'))

    # Convert to enum with fallback for invalid values
    conn.execute(
        sa.text(
            f"""
            ALTER TABLE "{table_name}"
            ALTER COLUMN {column_name}
            TYPE {enum_name}
            USING (
                CASE
                    WHEN {column_name} IN ({allowed_sql}) THEN {column_name}::{enum_name}
                    ELSE '{fallback}'::{enum_name}
                END
            )
            """
        )
    )

    # Restore default
    conn.execute(
        sa.text(
            f"ALTER TABLE \"{table_name}\" ALTER COLUMN {column_name} SET DEFAULT '{fallback}'::{enum_name}"
        )
    )
    print(f"Migrated {table_name}.{column_name} to {enum_name}")


def upgrade() -> None:
    conn = op.get_bind()

    # Step 1: Ensure task_status_enum has all required values
    required_values = [
        "pending",
        "waiting_for_approval",
        "running",
        "completed",
        "failed",
        "cancelled",
    ]

    for value in required_values:
        _add_enum_value_if_missing(conn, "task_status_enum", value)

    # Step 2: Ensure executionplan.status uses task_status_enum
    # This is critical because the table was renamed from tasksession
    if not _column_uses_enum(conn, "executionplan", "status", "task_status_enum"):
        print("executionplan.status is not using task_status_enum, migrating...")
        _migrate_column_to_enum(
            conn,
            table_name="executionplan",
            column_name="status",
            enum_name="task_status_enum",
            allowed_values=(
                "pending",
                "waiting_for_approval",
                "running",
                "completed",
                "failed",
                "cancelled",
            ),
            fallback="pending",
        )


def downgrade() -> None:
    # PostgreSQL doesn't support removing enum values
    # This is a no-op downgrade
    pass
