"""Add runevent ledger table.

Revision ID: 20260308_150000
Revises: 20260308_133500
Create Date: 2026-03-08 15:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "20260308_150000"
down_revision: str | None = "20260308_133500"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _table_exists(conn, table_name: str) -> bool:
    return inspect(conn).has_table(table_name)


def _index_names(conn, table_name: str) -> set[str]:
    if not _table_exists(conn, table_name):
        return set()
    return {idx["name"] for idx in inspect(conn).get_indexes(table_name)}


def upgrade() -> None:
    conn = op.get_bind()

    run_event_type_enum = postgresql.ENUM(
        "run_created",
        "run_started",
        "router_decided",
        "plan_created",
        "plan_updated",
        "hitl_interrupted",
        "hitl_resumed",
        "hitl_rejected",
        "task_started",
        "task_completed",
        "task_failed",
        "artifact_generated",
        "run_completed",
        "run_failed",
        "run_cancelled",
        "run_timed_out",
        name="run_event_type_enum",
        create_type=False,
    )
    run_event_type_enum.create(conn, checkfirst=True)

    if not _table_exists(conn, "runevent"):
        op.create_table(
            "runevent",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True, nullable=False),
            sa.Column(
                "run_id",
                sa.String(length=64),
                sa.ForeignKey("agentrun.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("event_type", run_event_type_enum, nullable=False),
            sa.Column(
                "timestamp",
                sa.DateTime(),
                nullable=False,
                server_default=sa.text("now()"),
            ),
            sa.Column("event_data", sa.JSON(), nullable=True),
            sa.Column(
                "thread_id",
                sa.String(length=64),
                sa.ForeignKey("thread.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column(
                "execution_plan_id",
                sa.String(length=64),
                sa.ForeignKey("executionplan.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column("task_id", sa.String(length=64), nullable=True),
            sa.Column("note", sa.String(length=512), nullable=True),
        )

    existing_indexes = _index_names(conn, "runevent")
    if "ix_runevent_run_id" not in existing_indexes:
        op.create_index("ix_runevent_run_id", "runevent", ["run_id"], unique=False)
    if "ix_runevent_event_type" not in existing_indexes:
        op.create_index("ix_runevent_event_type", "runevent", ["event_type"], unique=False)
    if "ix_runevent_thread_id" not in existing_indexes:
        op.create_index("ix_runevent_thread_id", "runevent", ["thread_id"], unique=False)
    if "ix_runevent_execution_plan_id" not in existing_indexes:
        op.create_index(
            "ix_runevent_execution_plan_id",
            "runevent",
            ["execution_plan_id"],
            unique=False,
        )
    if "ix_runevent_task_id" not in existing_indexes:
        op.create_index("ix_runevent_task_id", "runevent", ["task_id"], unique=False)
    if "ix_runevent_run_id_timestamp" not in existing_indexes:
        op.create_index(
            "ix_runevent_run_id_timestamp",
            "runevent",
            ["run_id", "timestamp"],
            unique=False,
        )


def downgrade() -> None:
    conn = op.get_bind()
    existing_indexes = _index_names(conn, "runevent")

    if "ix_runevent_run_id_timestamp" in existing_indexes:
        op.drop_index("ix_runevent_run_id_timestamp", table_name="runevent")
    if "ix_runevent_task_id" in existing_indexes:
        op.drop_index("ix_runevent_task_id", table_name="runevent")
    if "ix_runevent_execution_plan_id" in existing_indexes:
        op.drop_index("ix_runevent_execution_plan_id", table_name="runevent")
    if "ix_runevent_thread_id" in existing_indexes:
        op.drop_index("ix_runevent_thread_id", table_name="runevent")
    if "ix_runevent_event_type" in existing_indexes:
        op.drop_index("ix_runevent_event_type", table_name="runevent")
    if "ix_runevent_run_id" in existing_indexes:
        op.drop_index("ix_runevent_run_id", table_name="runevent")

    if _table_exists(conn, "runevent"):
        op.drop_table("runevent")

    postgresql.ENUM(name="run_event_type_enum").drop(conn, checkfirst=True)
