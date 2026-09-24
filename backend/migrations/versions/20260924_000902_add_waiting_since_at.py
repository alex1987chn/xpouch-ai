"""agentrun 增加 waiting_since_at（审批超时判据起点）

Revision ID: 20260924_000902
Revises: 20260924_000901
Create Date: 2026-09-24

审批超时机制（APPROVAL_TIMEOUT_HOURS，默认 24h）的计时起点列：
- 不能复用 updated_at（语义是「最后一次续租」，每 20s 刷新，代码注释明令
  禁止在其上建判据）
- 由 update_run_status 在状态切入 waiting_for_approval 时盖章，重入等待
  （计划修订后再等）重新计时
- 存量 waiting 行回填 now()：时钟从部署时刻起算，不做瞬时击杀
- 判定见 utils/run_lease.approval_deadline_exceeded（None=不判死）
"""

from collections.abc import Sequence

from alembic import op
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision: str = "20260924_000902"
down_revision: str | None = "20260924_000901"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(text("ALTER TABLE agentrun ADD COLUMN IF NOT EXISTS waiting_since_at TIMESTAMPTZ"))
    backfilled = conn.execute(
        text(
            "UPDATE agentrun SET waiting_since_at = now() "
            "WHERE status = 'waiting_for_approval' AND waiting_since_at IS NULL"
        )
    )
    if backfilled.rowcount:
        print(f"[migration 000902] 存量等待行回填计时起点: {backfilled.rowcount} 行")


def downgrade() -> None:
    op.get_bind().execute(text("ALTER TABLE agentrun DROP COLUMN IF EXISTS waiting_since_at"))
