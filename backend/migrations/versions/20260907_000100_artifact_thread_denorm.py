"""artifact 增加 thread_id 冗余列并回填存量

产物中心（跨会话产物列表）需要按用户过滤产物。此前 artifact 只挂
sub_task_id，归属过滤必须 4 表 join（artifact→subtask→executionplan→thread），
分页代价高且查询复杂。本迁移为 artifact 增加 thread_id 冗余列（索引），
并按既有外键链路一次性回填存量数据。

写入侧由 crud/execution_plan.py 的 _derive_thread_id 在创建时自动派生，
两条产物写入路径（create_artifact / create_artifacts_batch）均已接入。

Revision ID: 20260907_000100
Revises: 20260903_094500
Create Date: 2026-09-07
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260907_000100"
down_revision: str | None = "20260903_094500"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. 加列（nullable——回填前允许空，模型侧同为 Optional）
    op.add_column("artifact", sa.Column("thread_id", sa.String(64), nullable=True))
    op.create_index("ix_artifact_thread_id", "artifact", ["thread_id"])

    # 2. 按既有外键链路回填存量（幂等：IS DISTINCT FROM 防重复更新）
    op.execute(
        """
        UPDATE artifact AS a
        SET thread_id = e.thread_id
        FROM subtask AS s
        JOIN executionplan AS e ON s.execution_plan_id = e.id
        WHERE a.sub_task_id = s.id
          AND a.thread_id IS DISTINCT FROM e.thread_id
        """
    )


def downgrade() -> None:
    op.drop_index("ix_artifact_thread_id", table_name="artifact")
    op.drop_column("artifact", "thread_id")
