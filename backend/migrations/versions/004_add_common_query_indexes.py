"""Add common query indexes for thread/customagent/tasksession

Revision ID: 004
Revises: 003
Create Date: 2026-03-04 10:10:00.000000
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "004"
down_revision: str | None = "003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index("idx_thread_user_updated", "thread", ["user_id", "updated_at"], unique=False)
    op.create_index(
        "idx_customagent_user_default_created",
        "customagent",
        ["user_id", "is_default", "created_at"],
        unique=False,
    )
    op.create_index(
        "idx_tasksession_thread_created", "tasksession", ["thread_id", "created_at"], unique=False
    )


def downgrade() -> None:
    op.drop_index("idx_tasksession_thread_created", table_name="tasksession")
    op.drop_index("idx_customagent_user_default_created", table_name="customagent")
    op.drop_index("idx_thread_user_updated", table_name="thread")
