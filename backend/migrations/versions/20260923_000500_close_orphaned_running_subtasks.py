"""存量清洗：run 已异常终态但 SubTask/专家消息仍挂 running 的僵尸行

根因（已在 crud/agent_run.close_orphaned_task_state 修复）：run 超时/失败/
取消的收尾只改 run 行，正在执行的 SubTask 与 running 态专家执行消息无人
收尾——前端会话恢复读到"还有 running 任务"就永远显示"任务仍在执行中"，
统计页停在卡死的那一步，会话无法完成（实测用户会话）。

本迁移把存量僵尸行清洗为 failed：
- SubTask：所属 run ∈ (failed, timed_out, cancelled) 且 status='running'
- Message：extra_data.message_kind='expert_result' 且 status='running'，
  且其 thread 的最新 run 已终态（同 thread 单 active run 互斥，安全）

数据回填不回滚（回滚会重新制造卡死态）。
"""

from collections.abc import Sequence

from alembic import op
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision: str = "20260923_000500"
down_revision: str | None = "20260923_000400"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TERMINAL_RUN_STATUSES = ("failed", "timed_out", "cancelled")
_FAIL_NOTE = "运行异常终止（超时/失败/取消），任务收尾为 failed"


def upgrade() -> None:
    import json
    from datetime import UTC, datetime

    conn = op.get_bind()
    now = datetime.now(UTC).isoformat()

    # 1) 僵尸 SubTask → failed（终态集合为字面量守卫，非用户输入）
    subtask_result = conn.execute(
        text(
            "UPDATE subtask s SET status = 'failed', completed_at = :now, "
            "updated_at = :now FROM executionplan e JOIN agentrun r ON e.run_id = r.id "
            "WHERE s.execution_plan_id = e.id AND s.status = 'running' "
            "AND r.status IN ('failed', 'timed_out', 'cancelled')"
        ),
        {"now": now},
    )
    # 2) 僵尸专家消息 → failed。
    # ⚠️ extra_data 的列类型跨环境漂移（生产=text，开发=json，2026-09-23 部署实抓）：
    # `->>` 只存在于 json/jsonb——统一经 `NULLIF(extra_data::text,'')::json` 取值，
    # 两种列类型通吃且空串安全；列类型归一在 000700 治本。
    msg_rows = conn.execute(
        text(
            "SELECT m.id, m.thread_id, m.extra_data FROM message m "
            "WHERE m.role = 'assistant' "
            "AND NULLIF(m.extra_data::text, '')::json ->> 'message_kind' = 'expert_result' "
            "AND NULLIF(m.extra_data::text, '')::json ->> 'status' = 'running'"
        )
    ).fetchall()
    closed_msgs = 0
    for msg_id, thread_id, extra in msg_rows:
        latest = conn.execute(
            text(
                "SELECT status FROM agentrun WHERE thread_id = :t ORDER BY created_at DESC LIMIT 1"
            ),
            {"t": thread_id},
        ).fetchone()
        if latest is None or latest[0] not in _TERMINAL_RUN_STATUSES:
            continue
        # json 列返回 dict、text 列返回 str——统一解析
        data = json.loads(extra) if isinstance(extra, str) else dict(extra or {})
        data.update(status="failed", error=_FAIL_NOTE)
        # 回写用字符串参数：text 列直接存，json 列由赋值上下文完成 text→json
        conn.execute(
            text("UPDATE message SET extra_data = :new_json WHERE id = :id"),
            {"new_json": json.dumps(data, ensure_ascii=False), "id": msg_id},
        )
        closed_msgs += 1
    print(
        f"[migration 000500] closed {subtask_result.rowcount} zombie subtasks, "
        f"{closed_msgs} zombie expert messages"
    )


def downgrade() -> None:
    # 数据回填不回滚
    pass
