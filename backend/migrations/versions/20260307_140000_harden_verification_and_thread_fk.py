"""Harden verification flow and add thread task_session foreign key.

Revision ID: 20260307_140000
Revises: 20260306_120000
Create Date: 2026-03-07 14:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision: str = "20260307_140000"
down_revision: str | None = "20260306_120000"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _column_names(conn, table_name: str) -> set[str]:
    inspector = inspect(conn)
    return {column["name"] for column in inspector.get_columns(table_name)}


def _foreign_key_names(conn, table_name: str) -> set[str]:
    inspector = inspect(conn)
    return {fk["name"] for fk in inspector.get_foreign_keys(table_name) if fk.get("name")}


def upgrade() -> None:
    conn = op.get_bind()
    user_columns = _column_names(conn, "user")

    if "verification_code_attempts" not in user_columns:
        op.add_column(
            "user",
            sa.Column(
                "verification_code_attempts", sa.Integer(), nullable=True, server_default="0"
            ),
        )
        op.execute(
            'UPDATE "user" SET verification_code_attempts = 0 WHERE verification_code_attempts IS NULL'
        )
        op.alter_column("user", "verification_code_attempts", nullable=False, server_default=None)

    if "verification_code_locked_until" not in user_columns:
        op.add_column(
            "user", sa.Column("verification_code_locked_until", sa.DateTime(), nullable=True)
        )

    if "verification_code_last_sent_at" not in user_columns:
        op.add_column(
            "user", sa.Column("verification_code_last_sent_at", sa.DateTime(), nullable=True)
        )

    if "verification_code_send_count" not in user_columns:
        op.add_column(
            "user",
            sa.Column(
                "verification_code_send_count", sa.Integer(), nullable=True, server_default="0"
            ),
        )
        op.execute(
            'UPDATE "user" SET verification_code_send_count = 0 WHERE verification_code_send_count IS NULL'
        )
        op.alter_column("user", "verification_code_send_count", nullable=False, server_default=None)

    if "verification_code_send_count_reset_at" not in user_columns:
        op.add_column(
            "user",
            sa.Column("verification_code_send_count_reset_at", sa.DateTime(), nullable=True),
        )

    fk_names = _foreign_key_names(conn, "thread")
    if "fk_thread_task_session_id_tasksession" not in fk_names:
        op.execute(
            sa.text(
                """
                UPDATE thread
                SET task_session_id = NULL
                WHERE task_session_id IS NOT NULL
                  AND NOT EXISTS (
                      SELECT 1
                      FROM tasksession
                      WHERE tasksession.session_id = thread.task_session_id
                  )
                """
            )
        )
        op.create_foreign_key(
            "fk_thread_task_session_id_tasksession",
            "thread",
            "tasksession",
            ["task_session_id"],
            ["session_id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    conn = op.get_bind()
    fk_names = _foreign_key_names(conn, "thread")
    if "fk_thread_task_session_id_tasksession" in fk_names:
        op.drop_constraint("fk_thread_task_session_id_tasksession", "thread", type_="foreignkey")

    user_columns = _column_names(conn, "user")
    for column_name in [
        "verification_code_send_count_reset_at",
        "verification_code_send_count",
        "verification_code_last_sent_at",
        "verification_code_locked_until",
        "verification_code_attempts",
    ]:
        if column_name in user_columns:
            op.drop_column("user", column_name)
