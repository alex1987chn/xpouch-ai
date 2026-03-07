"""Add AgentRun foundation and rename TaskSession to ExecutionPlan.

Revision ID: 20260307_160000
Revises: 20260307_140000
Create Date: 2026-03-07 16:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision: str = "20260307_160000"
down_revision: str | None = "20260307_140000"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _table_exists(conn, table_name: str) -> bool:
    return inspect(conn).has_table(table_name)


def _column_names(conn, table_name: str) -> set[str]:
    return {column["name"] for column in inspect(conn).get_columns(table_name)}


def _foreign_key_names(conn, table_name: str) -> set[str]:
    return {fk["name"] for fk in inspect(conn).get_foreign_keys(table_name) if fk.get("name")}


def _index_names(conn, table_name: str) -> set[str]:
    return {idx["name"] for idx in inspect(conn).get_indexes(table_name)}


def upgrade() -> None:
    conn = op.get_bind()

    run_status_enum = sa.Enum(
        "queued",
        "running",
        "waiting_for_approval",
        "resuming",
        "completed",
        "failed",
        "cancelled",
        "timed_out",
        name="run_status_enum",
    )
    run_status_enum.create(conn, checkfirst=True)

    if not _table_exists(conn, "agentrun"):
        op.create_table(
            "agentrun",
            sa.Column("id", sa.String(length=64), primary_key=True, nullable=False),
            sa.Column(
                "thread_id", sa.String(length=64), sa.ForeignKey("thread.id"), nullable=False
            ),
            sa.Column("user_id", sa.String(length=64), sa.ForeignKey("user.id"), nullable=False),
            sa.Column("entrypoint", sa.String(length=32), nullable=False),
            sa.Column("mode", sa.String(length=32), nullable=False),
            sa.Column("status", run_status_enum, nullable=False),
            sa.Column("idempotency_key", sa.String(length=128), nullable=True),
            sa.Column("checkpoint_namespace", sa.String(length=128), nullable=True),
            sa.Column("current_node", sa.String(length=128), nullable=True),
            sa.Column("error_code", sa.String(length=64), nullable=True),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.Column(
                "retry_of_run_id",
                sa.String(length=64),
                sa.ForeignKey("agentrun.id"),
                nullable=True,
            ),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("started_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.Column("last_heartbeat_at", sa.DateTime(), nullable=True),
            sa.Column("completed_at", sa.DateTime(), nullable=True),
            sa.Column("cancelled_at", sa.DateTime(), nullable=True),
            sa.Column("timed_out_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_agentrun_thread_id", "agentrun", ["thread_id"], unique=False)
        op.create_index("ix_agentrun_user_id", "agentrun", ["user_id"], unique=False)
        op.create_index("ix_agentrun_entrypoint", "agentrun", ["entrypoint"], unique=False)
        op.create_index("ix_agentrun_mode", "agentrun", ["mode"], unique=False)
        op.create_index("ix_agentrun_status", "agentrun", ["status"], unique=False)
        op.create_index(
            "ix_agentrun_idempotency_key", "agentrun", ["idempotency_key"], unique=False
        )

    if _table_exists(conn, "tasksession") and not _table_exists(conn, "executionplan"):
        op.rename_table("tasksession", "executionplan")

    if _table_exists(conn, "thread"):
        thread_columns = _column_names(conn, "thread")
        if "task_session_id" in thread_columns and "execution_plan_id" not in thread_columns:
            op.alter_column("thread", "task_session_id", new_column_name="execution_plan_id")

    if _table_exists(conn, "subtask"):
        subtask_columns = _column_names(conn, "subtask")
        if "task_session_id" in subtask_columns and "execution_plan_id" not in subtask_columns:
            op.alter_column("subtask", "task_session_id", new_column_name="execution_plan_id")

    if _table_exists(conn, "executionplan"):
        columns = _column_names(conn, "executionplan")
        if "session_id" in columns and "id" not in columns:
            op.alter_column("executionplan", "session_id", new_column_name="id")

        columns = _column_names(conn, "executionplan")
        if "run_id" not in columns:
            op.add_column("executionplan", sa.Column("run_id", sa.String(length=64), nullable=True))

        fk_names = _foreign_key_names(conn, "executionplan")
        if "fk_executionplan_run_id_agentrun" not in fk_names:
            op.create_foreign_key(
                "fk_executionplan_run_id_agentrun",
                "executionplan",
                "agentrun",
                ["run_id"],
                ["id"],
                ondelete="SET NULL",
            )

        indexes = _index_names(conn, "executionplan")
        if "ix_executionplan_run_id" not in indexes:
            op.create_index("ix_executionplan_run_id", "executionplan", ["run_id"], unique=False)

    # 清理和重建关键外键，确保命名与新语义一致
    if _table_exists(conn, "thread"):
        fk_names = _foreign_key_names(conn, "thread")
        for fk_name in [
            "fk_thread_task_session_id_tasksession",
            "fk_thread_execution_plan_id_executionplan",
        ]:
            if fk_name in fk_names:
                op.drop_constraint(fk_name, "thread", type_="foreignkey")
        if "execution_plan_id" in _column_names(conn, "thread"):
            conn.execute(
                sa.text(
                    """
                    UPDATE thread
                    SET execution_plan_id = NULL
                    WHERE execution_plan_id IS NOT NULL
                      AND NOT EXISTS (
                          SELECT 1
                          FROM executionplan
                          WHERE executionplan.id = thread.execution_plan_id
                      )
                    """
                )
            )
            op.create_foreign_key(
                "fk_thread_execution_plan_id_executionplan",
                "thread",
                "executionplan",
                ["execution_plan_id"],
                ["id"],
                ondelete="SET NULL",
            )

    if _table_exists(conn, "subtask"):
        fk_names = _foreign_key_names(conn, "subtask")
        for fk_name in ["subtask_task_session_id_fkey", "subtask_execution_plan_id_fkey"]:
            if fk_name in fk_names:
                op.drop_constraint(fk_name, "subtask", type_="foreignkey")
        if "execution_plan_id" in _column_names(conn, "subtask"):
            conn.execute(
                sa.text(
                    """
                    DELETE FROM subtask
                    WHERE execution_plan_id IS NOT NULL
                      AND NOT EXISTS (
                          SELECT 1
                          FROM executionplan
                          WHERE executionplan.id = subtask.execution_plan_id
                      )
                    """
                )
            )
            op.create_foreign_key(
                "subtask_execution_plan_id_fkey",
                "subtask",
                "executionplan",
                ["execution_plan_id"],
                ["id"],
            )

        indexes = _index_names(conn, "subtask")
        if "idx_subtask_session_status" in indexes:
            op.drop_index("idx_subtask_session_status", table_name="subtask")
        if "idx_subtask_execution_plan_status" not in indexes:
            op.create_index(
                "idx_subtask_execution_plan_status",
                "subtask",
                ["execution_plan_id", "status"],
                unique=False,
            )


def downgrade() -> None:
    conn = op.get_bind()

    if _table_exists(conn, "subtask"):
        fk_names = _foreign_key_names(conn, "subtask")
        if "subtask_execution_plan_id_fkey" in fk_names:
            op.drop_constraint("subtask_execution_plan_id_fkey", "subtask", type_="foreignkey")

        indexes = _index_names(conn, "subtask")
        if "idx_subtask_execution_plan_status" in indexes:
            op.drop_index("idx_subtask_execution_plan_status", table_name="subtask")
        if "execution_plan_id" in _column_names(
            conn, "subtask"
        ) and "task_session_id" not in _column_names(conn, "subtask"):
            op.alter_column("subtask", "execution_plan_id", new_column_name="task_session_id")

    if _table_exists(conn, "thread"):
        fk_names = _foreign_key_names(conn, "thread")
        if "fk_thread_execution_plan_id_executionplan" in fk_names:
            op.drop_constraint(
                "fk_thread_execution_plan_id_executionplan", "thread", type_="foreignkey"
            )
        if "execution_plan_id" in _column_names(
            conn, "thread"
        ) and "task_session_id" not in _column_names(conn, "thread"):
            op.alter_column("thread", "execution_plan_id", new_column_name="task_session_id")

    if _table_exists(conn, "executionplan"):
        indexes = _index_names(conn, "executionplan")
        if "ix_executionplan_run_id" in indexes:
            op.drop_index("ix_executionplan_run_id", table_name="executionplan")

        fk_names = _foreign_key_names(conn, "executionplan")
        if "fk_executionplan_run_id_agentrun" in fk_names:
            op.drop_constraint(
                "fk_executionplan_run_id_agentrun", "executionplan", type_="foreignkey"
            )

        columns = _column_names(conn, "executionplan")
        if "run_id" in columns:
            op.drop_column("executionplan", "run_id")
        if "id" in columns and "session_id" not in columns:
            op.alter_column("executionplan", "id", new_column_name="session_id")

    if _table_exists(conn, "executionplan") and not _table_exists(conn, "tasksession"):
        op.rename_table("executionplan", "tasksession")

    if _table_exists(conn, "agentrun"):
        for index_name in [
            "ix_agentrun_idempotency_key",
            "ix_agentrun_status",
            "ix_agentrun_mode",
            "ix_agentrun_entrypoint",
            "ix_agentrun_user_id",
            "ix_agentrun_thread_id",
        ]:
            op.drop_index(index_name, table_name="agentrun")
        op.drop_table("agentrun")

    sa.Enum(name="run_status_enum").drop(conn, checkfirst=True)
