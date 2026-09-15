"""对齐 schema 与模型元数据（评审 M1 漂移对齐收尾）

Revision ID: 20260914_000200
Revises: 20260914_000100
Create Date: 2026-09-14

三类操作，全部是把**迁移库**对齐到**模型元数据**（models/ 为真相源）：

1. 索引统一为模型命名约定 `idx_%(column_0_label)s`（见 models/__init__.py）。
   迁移史上有两套旧名：squash 前 baseline 的 `ix_*` 时代产物、与表改名遗留的
   `idx_tasksession_*` 前缀。**每个索引都是「守卫改名 + 兜底补建」两步**：
   旧名在才改、新名不在才建——因为库的出身有两类（全新部署走迁移链、
   create_all 时代老库走全量迁移史），旧名的覆盖面不同。第一版用裸 ALTER
   在开发库（create_all 时代）上当场炸出 `relation does not exist`，
   这就是教训：这类迁移必须在真实老库上验证，只跑空库链不算数。
2. 补建模型声明但迁移链从未创建的索引（IF NOT EXISTS，任何状态安全）。
3. 杂项：executionplan.run_id 补外键（模型声明 CASCADE，迁移链漏建）、
   systemexpert.config_version 对齐非空声明（存量 NULL 时跳过并留待
   alembic check 暴露，不在迁移里编造数据）、清理 thread.task_session_id
   死列与死索引（模型无此字段，全仓零引用）、删除与唯一索引冗余的
   systemexpert 唯一约束。

全部语句为**编译期字面量**（标识符无法参数化）；所有可能因库状态而失败
的语句都有存在性守卫，任何数据库状态都可安全重放。
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260914_000200"
down_revision: str | None = "20260914_000100"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ── 1. 索引改名：旧名在、新名不在才执行（守卫式，字面量 SQL）──
    op.execute(
        """
        DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'ix_agentrun_entrypoint' AND tablename = 'agentrun')
               AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_agentrun_entrypoint') THEN
                ALTER INDEX ix_agentrun_entrypoint RENAME TO idx_agentrun_entrypoint;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'ix_agentrun_idempotency_key' AND tablename = 'agentrun')
               AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_agentrun_idempotency_key') THEN
                ALTER INDEX ix_agentrun_idempotency_key RENAME TO idx_agentrun_idempotency_key;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'ix_agentrun_lease_expires_at' AND tablename = 'agentrun')
               AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_agentrun_lease_expires_at') THEN
                ALTER INDEX ix_agentrun_lease_expires_at RENAME TO idx_agentrun_lease_expires_at;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'ix_agentrun_mode' AND tablename = 'agentrun')
               AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_agentrun_mode') THEN
                ALTER INDEX ix_agentrun_mode RENAME TO idx_agentrun_mode;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'ix_agentrun_status' AND tablename = 'agentrun')
               AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_agentrun_status') THEN
                ALTER INDEX ix_agentrun_status RENAME TO idx_agentrun_status;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'ix_agentrun_thread_id' AND tablename = 'agentrun')
               AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_agentrun_thread_id') THEN
                ALTER INDEX ix_agentrun_thread_id RENAME TO idx_agentrun_thread_id;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'ix_agentrun_user_id' AND tablename = 'agentrun')
               AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_agentrun_user_id') THEN
                ALTER INDEX ix_agentrun_user_id RENAME TO idx_agentrun_user_id;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'ix_artifact_thread_id' AND tablename = 'artifact')
               AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_artifact_thread_id') THEN
                ALTER INDEX ix_artifact_thread_id RENAME TO idx_artifact_thread_id;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'ix_auditlog_action' AND tablename = 'auditlog')
               AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_auditlog_action') THEN
                ALTER INDEX ix_auditlog_action RENAME TO idx_auditlog_action;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'ix_auditlog_actor_user_id' AND tablename = 'auditlog')
               AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_auditlog_actor_user_id') THEN
                ALTER INDEX ix_auditlog_actor_user_id RENAME TO idx_auditlog_actor_user_id;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'ix_auditlog_actor_username' AND tablename = 'auditlog')
               AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_auditlog_actor_username') THEN
                ALTER INDEX ix_auditlog_actor_username RENAME TO idx_auditlog_actor_username;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'ix_auditlog_created' AND tablename = 'auditlog')
               AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_auditlog_created') THEN
                ALTER INDEX ix_auditlog_created RENAME TO idx_auditlog_created;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'ix_auditlog_target' AND tablename = 'auditlog')
               AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_auditlog_target') THEN
                ALTER INDEX ix_auditlog_target RENAME TO idx_auditlog_target;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'ix_executionplan_run_id' AND tablename = 'executionplan')
               AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_executionplan_run_id') THEN
                ALTER INDEX ix_executionplan_run_id RENAME TO idx_executionplan_run_id;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'ix_executionplan_status' AND tablename = 'executionplan')
               AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_executionplan_status') THEN
                ALTER INDEX ix_executionplan_status RENAME TO idx_executionplan_status;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'ix_executionplan_thread_id' AND tablename = 'executionplan')
               AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_executionplan_thread_id') THEN
                ALTER INDEX ix_executionplan_thread_id RENAME TO idx_executionplan_thread_id;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'ix_executionplan_user_query' AND tablename = 'executionplan')
               AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_executionplan_user_query') THEN
                ALTER INDEX ix_executionplan_user_query RENAME TO idx_executionplan_user_query;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'ix_runevent_event_type' AND tablename = 'runevent')
               AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_runevent_event_type') THEN
                ALTER INDEX ix_runevent_event_type RENAME TO idx_runevent_event_type;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'ix_runevent_execution_plan_id' AND tablename = 'runevent')
               AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_runevent_execution_plan_id') THEN
                ALTER INDEX ix_runevent_execution_plan_id RENAME TO idx_runevent_execution_plan_id;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'ix_runevent_run_id' AND tablename = 'runevent')
               AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_runevent_run_id') THEN
                ALTER INDEX ix_runevent_run_id RENAME TO idx_runevent_run_id;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'ix_runevent_run_id_timestamp' AND tablename = 'runevent')
               AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_runevent_run_id_timestamp') THEN
                ALTER INDEX ix_runevent_run_id_timestamp RENAME TO idx_runevent_run_id_timestamp;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'ix_runevent_task_id' AND tablename = 'runevent')
               AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_runevent_task_id') THEN
                ALTER INDEX ix_runevent_task_id RENAME TO idx_runevent_task_id;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'ix_runevent_thread_id' AND tablename = 'runevent')
               AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_runevent_thread_id') THEN
                ALTER INDEX ix_runevent_thread_id RENAME TO idx_runevent_thread_id;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'ix_share_token_template_key' AND tablename = 'share_token')
               AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_share_token_template_key') THEN
                ALTER INDEX ix_share_token_template_key RENAME TO idx_share_token_template_key;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'ix_skilltemplate_category' AND tablename = 'skilltemplate')
               AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_skilltemplate_category') THEN
                ALTER INDEX ix_skilltemplate_category RENAME TO idx_skilltemplate_category;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'ix_skilltemplate_recommended_mode' AND tablename = 'skilltemplate')
               AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_skilltemplate_recommended_mode') THEN
                ALTER INDEX ix_skilltemplate_recommended_mode RENAME TO idx_skilltemplate_recommended_mode;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'ix_toolpolicy_source' AND tablename = 'toolpolicy')
               AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_toolpolicy_source') THEN
                ALTER INDEX ix_toolpolicy_source RENAME TO idx_toolpolicy_source;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_tasksession_thread_created' AND tablename = 'executionplan')
               AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_executionplan_thread_created') THEN
                ALTER INDEX idx_tasksession_thread_created RENAME TO idx_executionplan_thread_created;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_tasksession_thread_id' AND tablename = 'executionplan')
               AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_executionplan_thread_id') THEN
                ALTER INDEX idx_tasksession_thread_id RENAME TO idx_executionplan_thread_id;
            END IF;
        END $$;
        """
    )

    # ── 2. 补建模型已声明、库上缺失的索引（旧名已改名的到这一步已是新名，跳过）──
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
        "CREATE INDEX IF NOT EXISTS idx_executionplan_thread_created "
        "ON executionplan (thread_id, created_at)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_executionplan_thread_id ON executionplan (thread_id)"
    )
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
    # executionplan.run_id 补外键：约束已存在（重放）则跳过
    op.execute(
        """
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'executionplan_run_id_fkey'
                  AND conrelid = 'executionplan'::regclass
            ) THEN
                ALTER TABLE executionplan ADD CONSTRAINT executionplan_run_id_fkey
                    FOREIGN KEY (run_id) REFERENCES agentrun(id) ON DELETE CASCADE;
            END IF;
        END $$;
        """
    )
    # systemexpert.config_version 对齐非空声明：仅当没有 NULL 时收紧
    # （存量 NULL 说明是数据问题不是迁移问题——跳过后由 alembic check 暴露，
    # 不在迁移里编造数据）
    op.execute(
        """
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM systemexpert WHERE config_version IS NULL) THEN
                ALTER TABLE systemexpert ALTER COLUMN config_version SET NOT NULL;
            END IF;
        END $$;
        """
    )
    # 与唯一索引冗余的唯一约束（模型只声明唯一索引）
    op.execute("ALTER TABLE systemexpert DROP CONSTRAINT IF EXISTS systemexpert_expert_key_key")
    # 死列清理：thread.task_session_id（模型无字段，全仓零引用）
    op.execute("DROP INDEX IF EXISTS idx_thread_task_session_id")
    op.execute("ALTER TABLE thread DROP COLUMN IF EXISTS task_session_id")


def downgrade() -> None:
    # 结构对齐类迁移：反向不恢复历史脏命名/死列（无数据损失，无需可逆）。
    pass
