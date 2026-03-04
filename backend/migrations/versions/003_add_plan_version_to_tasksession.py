"""Add plan_version optimistic lock for tasksession

Revision ID: 003
Revises: 002
Create Date: 2026-03-03 22:40:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "003"
down_revision: str | None = "002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 检查列是否已存在（避免重复执行报错）
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [col['name'] for col in inspector.get_columns('tasksession')]

    if 'plan_version' not in columns:
        # 1) 先添加可空列，避免历史数据迁移失败
        op.add_column("tasksession", sa.Column("plan_version", sa.Integer(), nullable=True))

        # 2) 回填历史数据
        op.execute("UPDATE tasksession SET plan_version = 1 WHERE plan_version IS NULL")

        # 3) 设置非空约束
        op.alter_column("tasksession", "plan_version", nullable=False)


def downgrade() -> None:
    op.drop_column("tasksession", "plan_version")
