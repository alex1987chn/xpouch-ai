"""HITL 计划修订：run_event_type_enum 新增修订事件值

- hitl_revision_started（驳回+反馈 → 修订中）
- hitl_revision_failed（修订失败，原计划保持待审）
- 修订成功复用既有 plan_updated，不加新值

Revision ID: 20260912_000200
Revises: 20260912_000100
Create Date: 2026-09-12
"""

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260912_000200"
down_revision: str | None = "20260912_000100"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # PG 原生枚举加值不能在事务块内执行（PG12 前的硬限制），走 autocommit 块
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE run_event_type_enum ADD VALUE IF NOT EXISTS 'hitl_revision_started'")
        op.execute("ALTER TYPE run_event_type_enum ADD VALUE IF NOT EXISTS 'hitl_revision_failed'")


def downgrade() -> None:
    # PG 不支持删除枚举值；如需回滚只能重建类型（此处有意留空）
    pass
