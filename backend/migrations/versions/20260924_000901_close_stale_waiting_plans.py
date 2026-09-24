"""僵尸"等待审批"收口：run 已终态而 plan 挂 waiting_for_approval / 子任务挂 pending

Revision ID: 20260924_000901
Revises: 20260924_000900
Create Date: 2026-09-24

根因（代码侧已同步修复，本迁移清存量）：run 超时/取消的终态收口
（crud/agent_run.close_orphaned_task_state）曾只收 RUNNING 态子任务与专家
消息，不碰 ExecutionPlan.status、也不收 PENDING 子任务——计划挂
waiting_for_approval 的 run 死后就永久"在等审批"（前端跟着 run 走什么都不
显示，账面与界面脱节；2026-09-24 审计实积 21 个僵尸计划、51 条 pending
子任务，全部属于 09-06~09-13 的测试会话）。

000900 只收了 plan='running'；本迁移按键定 run 终态收口剩余形态：
- 子任务 status ∈ (pending, waiting_for_approval) 且 run 已终态 → failed
- 计划 status ∈ (pending, waiting_for_approval) 且 run 已终态 → 按 run 映射
  （completed→completed；cancelled→cancelled；failed/timed_out→failed）
"""

from collections.abc import Sequence

from alembic import op
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision: str = "20260924_000901"
down_revision: str | None = "20260924_000900"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()

    subtask_rows = conn.execute(
        text(
            "UPDATE subtask s SET status = 'failed', completed_at = now(), "
            "updated_at = now() "
            "FROM executionplan e JOIN agentrun r ON e.run_id = r.id "
            "WHERE s.execution_plan_id = e.id "
            "AND s.status IN ('pending', 'waiting_for_approval') "
            "AND r.status IN ('completed', 'failed', 'cancelled', 'timed_out')"
        )
    )
    print(f"[migration 000901] 僵尸 pending 子任务收口: {subtask_rows.rowcount} 行")

    total = 0
    for run_status, plan_status in [
        ("completed", "completed"),
        ("cancelled", "cancelled"),
        ("failed", "failed"),
        ("timed_out", "failed"),
    ]:
        result = conn.execute(
            text(
                # SET 目标列不加限定（指向被更新表）；表达式里的同名列
                # 必须限定 e.（agentrun 也有，否则 AmbiguousColumn）
                "UPDATE executionplan e SET status = :plan_status, "
                "updated_at = now(), completed_at = COALESCE(e.completed_at, now()) "
                "FROM agentrun r "
                "WHERE e.run_id = r.id AND e.status IN ('pending', 'waiting_for_approval') "
                "AND r.status = :run_status"
            ),
            {"run_status": run_status, "plan_status": plan_status},
        )
        total += result.rowcount
        if result.rowcount:
            print(f"[migration 000901] run={run_status} → plan={plan_status}: {result.rowcount} 行")

    print(f"[migration 000901] 僵尸等待审批计划收口共 {total} 行")


def downgrade() -> None:
    # 数据修复无回滚价值（旧状态本身就是错的）
    pass
