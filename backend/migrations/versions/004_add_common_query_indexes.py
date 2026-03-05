"""Add common query indexes for thread/customagent/tasksession

Revision ID: 004
Revises: 003
Create Date: 2026-03-04 10:10:00.000000
"""

from collections.abc import Sequence

from alembic import op
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision: str = "004"
down_revision: str | None = "003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def index_exists(conn, table_name, index_name):
    """检查索引是否存在"""
    inspector = inspect(conn)
    indexes = inspector.get_indexes(table_name)
    return any(idx["name"] == index_name for idx in indexes)


def upgrade() -> None:
    conn = op.get_bind()

    # Thread 表的索引
    if not index_exists(conn, "thread", "idx_thread_user_updated"):
        op.create_index(
            "idx_thread_user_updated", "thread", ["user_id", "updated_at"], unique=False
        )

    # CustomAgent 表的索引
    if not index_exists(conn, "customagent", "idx_customagent_user_default_created"):
        op.create_index(
            "idx_customagent_user_default_created",
            "customagent",
            ["user_id", "is_default", "created_at"],
            unique=False,
        )

    # TaskSession 表的索引
    if not index_exists(conn, "tasksession", "idx_tasksession_thread_created"):
        op.create_index(
            "idx_tasksession_thread_created",
            "tasksession",
            ["thread_id", "created_at"],
            unique=False,
        )


def downgrade() -> None:
    conn = op.get_bind()

    if index_exists(conn, "tasksession", "idx_tasksession_thread_created"):
        op.drop_index("idx_tasksession_thread_created", table_name="tasksession")
    if index_exists(conn, "customagent", "idx_customagent_user_default_created"):
        op.drop_index("idx_customagent_user_default_created", table_name="customagent")
    if index_exists(conn, "thread", "idx_thread_user_updated"):
        op.drop_index("idx_thread_user_updated", table_name="thread")
