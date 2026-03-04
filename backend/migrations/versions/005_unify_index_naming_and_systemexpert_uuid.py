"""Unify index naming and migrate SystemExpert PK to UUID.

Revision ID: 005
Revises: 004
Create Date: 2026-03-04 13:30:00.000000
"""

import uuid
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "005"
down_revision: str | None = "004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


INDEX_RENAMES_UP = [
    ("ix_user_email", "idx_user_email"),
    ("ix_user_phone_number", "idx_user_phone_number"),
    ("ix_user_provider_id", "idx_user_provider_id"),
    ("ix_thread_agent_id", "idx_thread_agent_id"),
    ("ix_thread_agent_type", "idx_thread_agent_type"),
    ("ix_thread_status", "idx_thread_status"),
    ("ix_thread_task_session_id", "idx_thread_task_session_id"),
    ("ix_thread_thread_mode", "idx_thread_thread_mode"),
    ("ix_thread_user_id", "idx_thread_user_id"),
    ("ix_message_thread_id", "idx_message_thread_id"),
    ("ix_customagent_is_default", "idx_customagent_is_default"),
    ("ix_customagent_name", "idx_customagent_name"),
    ("ix_customagent_user_id", "idx_customagent_user_id"),
    ("ix_tasksession_thread_id", "idx_tasksession_thread_id"),
    ("ix_subtask_session_status", "idx_subtask_session_status"),
    ("ix_subtask_sort_order", "idx_subtask_sort_order"),
    ("ix_subtask_status", "idx_subtask_status"),
    ("ix_artifact_sub_task_id", "idx_artifact_sub_task_id"),
    ("ix_artifact_type", "idx_artifact_type"),
    ("ix_systemexpert_expert_key", "idx_systemexpert_expert_key"),
    ("ix_user_memories_user_id", "idx_user_memories_user_id"),
    ("ix_mcp_servers_is_active", "idx_mcp_servers_is_active"),
    ("ix_mcp_servers_name", "idx_mcp_servers_name"),
]

INDEX_RENAMES_DOWN = [(new, old) for old, new in INDEX_RENAMES_UP]


def _index_exists(index_name: str) -> bool:
    """Check index existence in current schema."""
    bind = op.get_bind()
    result = bind.execute(
        sa.text("SELECT to_regclass(:index_name)"),
        {"index_name": index_name},
    ).scalar_one()
    return result is not None


def _rename_indexes(pairs: list[tuple[str, str]]) -> None:
    for old, new in pairs:
        # Idempotent rename:
        # - old exists and new missing -> rename
        # - new already exists -> skip to avoid DuplicateTable
        # - old missing -> skip
        if _index_exists(new) or not _index_exists(old):
            continue
        op.execute(sa.text(f'ALTER INDEX "{old}" RENAME TO "{new}"'))


def upgrade() -> None:
    _rename_indexes(INDEX_RENAMES_UP)

    with op.batch_alter_table("systemexpert") as batch:
        batch.add_column(sa.Column("id_uuid", sa.String(), nullable=True))

    bind = op.get_bind()
    rows = bind.execute(sa.text("SELECT id FROM systemexpert")).fetchall()
    for row in rows:
        bind.execute(
            sa.text("UPDATE systemexpert SET id_uuid = :new_id WHERE id = :old_id"),
            {"new_id": str(uuid.uuid4()), "old_id": row.id},
        )

    with op.batch_alter_table("systemexpert") as batch:
        batch.alter_column("id_uuid", existing_type=sa.String(), nullable=False)
        batch.drop_constraint("systemexpert_pkey", type_="primary")
        batch.drop_column("id")
        batch.alter_column("id_uuid", new_column_name="id", existing_type=sa.String(), nullable=False)
        batch.create_primary_key("systemexpert_pkey", ["id"])


def downgrade() -> None:
    with op.batch_alter_table("systemexpert") as batch:
        batch.add_column(sa.Column("id_int", sa.Integer(), nullable=True))

    op.execute(
        sa.text(
            """
            WITH ranked AS (
                SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn
                FROM systemexpert
            )
            UPDATE systemexpert AS se
            SET id_int = ranked.rn
            FROM ranked
            WHERE se.id = ranked.id
            """
        )
    )

    with op.batch_alter_table("systemexpert") as batch:
        batch.alter_column("id_int", existing_type=sa.Integer(), nullable=False)
        batch.drop_constraint("systemexpert_pkey", type_="primary")
        batch.drop_column("id")
        batch.alter_column("id_int", new_column_name="id", existing_type=sa.Integer(), nullable=False)
        batch.create_primary_key("systemexpert_pkey", ["id"])

    _rename_indexes(INDEX_RENAMES_DOWN)
