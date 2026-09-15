"""对齐 schema 与模型元数据（评审 M1 漂移对齐收尾）

Revision ID: 20260914_000200
Revises: 20260914_000100
Create Date: 2026-09-14

三类操作，全部是把**迁移库**对齐到**模型元数据**（models/ 为真相源）：

1. 索引重命名：迁移史两套命名并存（005 统一 idx_ 前缀前的 ix_ 时代产物、
   与表改名遗留的 tasksession 前缀），统一为模型命名约定
   `idx_%(column_0_label)s`（见 models/__init__.py）。
2. 补建模型声明但迁移链从未创建的索引（create_all 时代它们只存在于
   开发库；全新部署一直缺这些索引）。
3. 杂项：executionplan.run_id 补外键（模型声明 CASCADE，迁移链漏建）、
   systemexpert.config_version SET NOT NULL（模型非 Optional，存量 0 NULL）、
   清理 thread.task_session_id 死列与死索引（模型无此字段，全仓零引用——
   thread 与智能体的关联早已改走 agent_id）、删除与唯一索引冗余的
   systemexpert 唯一约束。

全部语句为**编译期字面量**（标识符无法参数化；存在性用 IF EXISTS/IF NOT
EXISTS 兜底，任何数据库状态都可安全重放）。
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260914_000200"
down_revision: str | None = "20260914_000100"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ── 1. 索引重命名（ix_ 时代 / 表改名遗留 → idx_ 统一约定）──
    op.execute("ALTER INDEX ix_agentrun_entrypoint RENAME TO idx_agentrun_entrypoint")
    op.execute("ALTER INDEX ix_agentrun_idempotency_key RENAME TO idx_agentrun_idempotency_key")
    op.execute("ALTER INDEX ix_agentrun_lease_expires_at RENAME TO idx_agentrun_lease_expires_at")
    op.execute("ALTER INDEX ix_agentrun_mode RENAME TO idx_agentrun_mode")
    op.execute("ALTER INDEX ix_agentrun_status RENAME TO idx_agentrun_status")
    op.execute("ALTER INDEX ix_agentrun_thread_id RENAME TO idx_agentrun_thread_id")
    op.execute("ALTER INDEX ix_agentrun_user_id RENAME TO idx_agentrun_user_id")
    op.execute("ALTER INDEX ix_artifact_thread_id RENAME TO idx_artifact_thread_id")
    op.execute("ALTER INDEX ix_auditlog_action RENAME TO idx_auditlog_action")
    op.execute("ALTER INDEX ix_auditlog_actor_user_id RENAME TO idx_auditlog_actor_user_id")
    op.execute("ALTER INDEX ix_auditlog_actor_username RENAME TO idx_auditlog_actor_username")
    op.execute("ALTER INDEX ix_auditlog_created RENAME TO idx_auditlog_created")
    op.execute("ALTER INDEX ix_auditlog_target RENAME TO idx_auditlog_target")
    op.execute("ALTER INDEX ix_executionplan_run_id RENAME TO idx_executionplan_run_id")
    op.execute("ALTER INDEX ix_runevent_event_type RENAME TO idx_runevent_event_type")
    op.execute("ALTER INDEX ix_runevent_execution_plan_id RENAME TO idx_runevent_execution_plan_id")
    op.execute("ALTER INDEX ix_runevent_run_id RENAME TO idx_runevent_run_id")
    op.execute("ALTER INDEX ix_runevent_run_id_timestamp RENAME TO idx_runevent_run_id_timestamp")
    op.execute("ALTER INDEX ix_runevent_task_id RENAME TO idx_runevent_task_id")
    op.execute("ALTER INDEX ix_runevent_thread_id RENAME TO idx_runevent_thread_id")
    op.execute("ALTER INDEX ix_share_token_template_key RENAME TO idx_share_token_template_key")
    op.execute("ALTER INDEX ix_skilltemplate_category RENAME TO idx_skilltemplate_category")
    op.execute(
        "ALTER INDEX ix_skilltemplate_recommended_mode RENAME TO idx_skilltemplate_recommended_mode"
    )
    op.execute("ALTER INDEX ix_toolpolicy_source RENAME TO idx_toolpolicy_source")
    # 表改名遗留（tasksession → executionplan，20260307 改表名时索引未跟改）
    op.execute(
        "ALTER INDEX idx_tasksession_thread_created RENAME TO idx_executionplan_thread_created"
    )
    op.execute("ALTER INDEX idx_tasksession_thread_id RENAME TO idx_executionplan_thread_id")

    # ── 2. 补建模型已声明、迁移链从未创建的索引 ──
    op.execute("CREATE INDEX IF NOT EXISTS idx_agentrun_entrypoint ON agentrun (entrypoint)")
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_agentrun_idempotency_key ON agentrun (idempotency_key)"
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_agentrun_mode ON agentrun (mode)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_agentrun_status ON agentrun (status)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_agentrun_thread_id ON agentrun (thread_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_agentrun_user_id ON agentrun (user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_artifact_thread_id ON artifact (thread_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_executionplan_status ON executionplan (status)")
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_executionplan_user_query ON executionplan (user_query)"
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_runevent_event_type ON runevent (event_type)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_runevent_task_id ON runevent (task_id)")
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_thread_execution_plan_id ON thread (execution_plan_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_share_token_artifact_id ON share_token (artifact_id)"
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_share_token_created_by ON share_token (created_by)")
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_share_token_template_key ON share_token (template_key)"
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_share_token_token_hash ON share_token (token_hash)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_skilltemplate_category ON skilltemplate (category)")
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_skilltemplate_recommended_mode "
        "ON skilltemplate (recommended_mode)"
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_subtask_expert_type ON subtask (expert_type)")
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_subtask_execution_plan_id ON subtask (execution_plan_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_subtask_task_description ON subtask (task_description)"
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_toolpolicy_source ON toolpolicy (source)")

    # ── 3. 杂项对齐 ──
    # executionplan.run_id 补外键（模型声明 CASCADE，迁移链漏建）
    op.execute(
        "ALTER TABLE executionplan ADD CONSTRAINT executionplan_run_id_fkey "
        "FOREIGN KEY (run_id) REFERENCES agentrun(id) ON DELETE CASCADE"
    )
    # systemexpert.config_version 对齐模型非空声明（存量 0 NULL）
    op.execute("ALTER TABLE systemexpert ALTER COLUMN config_version SET NOT NULL")
    # 与唯一索引冗余的唯一约束（模型只声明唯一索引）
    op.execute("ALTER TABLE systemexpert DROP CONSTRAINT IF EXISTS systemexpert_expert_key_key")
    # 死列清理：thread.task_session_id（模型无字段，全仓零引用）
    op.execute("DROP INDEX IF EXISTS idx_thread_task_session_id")
    op.execute("ALTER TABLE thread DROP COLUMN IF EXISTS task_session_id")


def downgrade() -> None:
    # 结构对齐类迁移：反向不恢复历史脏命名/死列（无数据损失，无需可逆）。
    pass
