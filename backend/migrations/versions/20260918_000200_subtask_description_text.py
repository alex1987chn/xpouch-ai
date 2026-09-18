"""subtask.task_description 放宽为 TEXT（修订 LLM 产出超长撞 VARCHAR(500)）

Revision ID: 20260918_000200
Revises: 20260918_000100
Create Date: 2026-09-18

背景：HITL 修订路径（用户驳回计划后 LLM 重写）产出的任务描述可能超过
500 字（如"编写完整可运行的单文件 HTML5 游戏"这类精细需求），落库时
撞 subtask.task_description 的 VARCHAR(500) 限制报 StringDataRightTruncation。

任务描述本质上是自由文本（用户可编辑、LLM 可重写），用 TEXT 而非继续
加宽 VARCHAR——PG 里 TEXT 与 VARCHAR 性能无差异，避免下次再撞。
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260918_000200"
down_revision: str | None = "20260918_000100"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # VARCHAR → TEXT（PG 目录级操作，不重写表）
    op.execute(
        """
        DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'subtask' AND column_name = 'task_description'
                         AND data_type = 'character varying') THEN
                ALTER TABLE subtask ALTER COLUMN task_description TYPE TEXT;
            END IF;
        END $$;
        """
    )


def downgrade() -> None:
    # 不降级（TEXT → VARCHAR 可能截断现有数据）
    pass
