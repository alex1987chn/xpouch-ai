"""补 subtask.input_data 列——模型有列、迁移链无覆盖的 schema 漂移

models/domain/subtask.py 定义了 input_data JSON 列（专家执行所需上下文参数），
写入点真实存在（stream_service/task_manager/crud.execution_plan），但 001 初始
迁移与全后续迁移链均未创建该列：纯 alembic 链的全新环境（含按 README 自部署）
复杂任务一写计划即 UndefinedColumn。存量库（create_all 时代建表）已有该列，
故用 ADD COLUMN IF NOT EXISTS 幂等兼容两种现状。

Revision ID: 20260913_000100
Revises: 20260912_000400
Create Date: 2026-09-13
"""

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260913_000100"
down_revision: str | None = "20260912_000400"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE subtask ADD COLUMN IF NOT EXISTS input_data JSON")


def downgrade() -> None:
    op.execute("ALTER TABLE subtask DROP COLUMN IF EXISTS input_data")
