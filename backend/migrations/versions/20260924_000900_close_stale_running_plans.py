"""陈旧 running 计划收口（run 已终态而 ExecutionPlan 滞留 running）

Revision ID: 20260924_000900
Revises: 20260924_000800
Create Date: 2026-09-24

000500 关闭了僵尸 subtask 与 expert 消息，但没覆盖计划本身：run 进入终态后
ExecutionPlan.status 仍挂 running 的行会在会话恢复/统计里一直"看起来在跑"
（开发库实测 15 条：run completed 5 条、timed_out 10 条）。

映射规则（只动 status='running' 且 run 已终态的行；waiting_for_approval 的
run 属 HITL 合法等待，不在其列）：
- run completed            → plan completed
- run failed / timed_out   → plan failed
- run cancelled            → plan cancelled

completed_at 只在为空时补 now()（不覆盖已有值）。
"""

from collections.abc import Sequence

from alembic import op
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision: str = "20260924_000900"
down_revision: str | None = "20260924_000800"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# run 终态 → plan 终态（顺序执行，互斥条件不重叠）
_RUN_TO_PLAN_STATUS = [
    ("completed", "completed"),
    ("cancelled", "cancelled"),
    ("failed", "failed"),
    ("timed_out", "failed"),
]


def upgrade() -> None:
    conn = op.get_bind()

    total = 0
    for run_status, plan_status in _RUN_TO_PLAN_STATUS:
        result = conn.execute(
            text(
                # SET 目标列不加限定（指向被更新表，语法要求裸列名）；
                # COALESCE 表达式里的 completed_at 必须限定 e.——agentrun 同名列，
                # 不限定即 AmbiguousColumn
                "UPDATE executionplan e SET status = :plan_status, "
                "updated_at = now(), completed_at = COALESCE(e.completed_at, now()) "
                "FROM agentrun r "
                "WHERE e.run_id = r.id AND e.status = 'running' AND r.status = :run_status"
            ),
            {"run_status": run_status, "plan_status": plan_status},
        )
        total += result.rowcount
        if result.rowcount:
            print(f"[migration 000900] run={run_status} → plan={plan_status}: {result.rowcount} 行")

    print(f"[migration 000900] 共收口 {total} 条陈旧 running 计划")


def downgrade() -> None:
    # 数据修复无回滚价值（旧状态本身就是错的）；行保留
    pass
