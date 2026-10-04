"""executionplan 表加 baseline_snapshot 列（计划修订基线持久化）

Revision ID: 20261004_000909
Revises: 20261003_000908
Create Date: 2026-10-04

2026-09-27 用户实测缺口：修订循环的 v(n-1)↔v(n) 对比只活在审批卡内存
（前端 setPendingPlan 版本跳变留档），修订后切会话/刷新，restore 只能从
subtask 重建最新版，对比视图永久丢失。本迁移在计划行上落基线快照：

- 列形状：JSON {"version": n-1, "tasks": [RunPlanTask 同构]}，修订提交点
  （recovery_service.run_revision_job）整份写入，只增不改不读旧值
- 默认 NULL：未修订过的计划（v1 直达）没有基线，GET /runs/{id}/plan
  的 baseline 字段返回 null，前端行为与迁移前一致
- 无种子数据：基线是修订行为的副产物，不是内置事实

守卫式字面量 SQL：先查 information_schema 判存在再 ALTER，幂等重跑不炸。
"""

from collections.abc import Sequence

from alembic import op
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision: str = "20261004_000909"
down_revision: str | None = "20261003_000908"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()
    exists = conn.execute(
        text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name = 'executionplan' AND column_name = 'baseline_snapshot'"
        )
    ).fetchone()
    if not exists:
        conn.execute(text("ALTER TABLE executionplan ADD COLUMN baseline_snapshot JSON NULL"))
        print("[migration 000909] executionplan.baseline_snapshot 已添加（默认 NULL，行为不变）")
    else:
        print("[migration 000909] executionplan.baseline_snapshot 已存在，跳过")


def downgrade() -> None:
    # 回滚删列会丢历史修订基线；快照仅增强显示，保留列无行为影响
    pass
