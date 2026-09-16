"""老库类型对齐：create_all 时代遗留的类型/可空/索引名/死列/注释（56 项 → 0）

Revision ID: 20260916_000200
Revises: 20260916_000100
Create Date: 2026-09-16

背景：开发库与生产库同为 create_all 时代出身，与模型元数据存在三类真差异
（空库链早已一致，本迁移把老库拉齐）。**每条语句都有存在性/状态守卫**：
已对齐的库（含空库链）重放为 no-op。前置数据体检结论（2026-09-16 开发库）：
枚举目标列 distinct 值全部在值域内、nullable 目标列 0 NULL、
subtask.artifacts 死列 0 条非空——生产部署前应跑同款体检（deploy.sh 备份兜底）。

1. 类型：VARCHAR→原生枚举 ×4（USING 强转）；VARCHAR→Text ×3（PG 目录级
   操作不重写表）；列宽 ×5（收窄的两个带数据长度守卫）；JSONB→JSON ×1。
2. 可空：10 列 SET NOT NULL（守卫：存在 NULL 则跳过，留给 check 暴露）。
3. 索引：10 个改名（旧名在+新名不在+在正确表上）+ 7 个模型未声明的删除
   （含 share_token 上重复的非唯一 token_hash 索引——守卫 indisunique=false，
   不得误删空库链建出的唯一索引）。
4. 死列/注释：subtask.artifacts（create_all 时代 JSON 快照列，模型不声明）；
   mcp_servers 的三条历史注释（SQLModel 的 description= 不产生 DB 注释）。
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260916_000200"
down_revision: str | None = "20260916_000100"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ── 1a. VARCHAR → 原生枚举（当前仍是 varchar 才执行）──
    # 带 server default 的列要先摘默认再转（PG 不自动转换默认值表达式），
    # 转完按枚举类型重设回原语义的字面量。
    op.execute(
        """
        DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'user' AND column_name = 'role'
                         AND data_type = 'character varying') THEN
                ALTER TABLE "user" ALTER COLUMN role DROP DEFAULT;
                ALTER TABLE "user" ALTER COLUMN role TYPE user_role_enum USING role::user_role_enum;
                ALTER TABLE "user" ALTER COLUMN role SET DEFAULT 'user'::user_role_enum;
            END IF;
            IF EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'thread' AND column_name = 'agent_type'
                         AND data_type = 'character varying') THEN
                ALTER TABLE thread ALTER COLUMN agent_type TYPE conversation_type_enum
                    USING agent_type::conversation_type_enum;
            END IF;
            IF EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'subtask' AND column_name = 'status'
                         AND data_type = 'character varying') THEN
                ALTER TABLE subtask ALTER COLUMN status TYPE task_status_enum
                    USING status::task_status_enum;
            END IF;
            IF EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'subtask' AND column_name = 'execution_mode'
                         AND data_type = 'character varying') THEN
                ALTER TABLE subtask ALTER COLUMN execution_mode DROP DEFAULT;
                ALTER TABLE subtask ALTER COLUMN execution_mode TYPE execution_mode_enum
                    USING execution_mode::execution_mode_enum;
                ALTER TABLE subtask ALTER COLUMN execution_mode SET DEFAULT 'sequential'::execution_mode_enum;
            END IF;
        END $$;
        """
    )

    # ── 1b. VARCHAR → Text（目录级操作；模型 sa_type=Text）──
    op.execute(
        """
        DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'agentrun' AND column_name = 'error_message'
                         AND data_type = 'character varying') THEN
                ALTER TABLE agentrun ALTER COLUMN error_message TYPE text;
            END IF;
            IF EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'message' AND column_name = 'content'
                         AND data_type = 'character varying') THEN
                ALTER TABLE message ALTER COLUMN content TYPE text;
            END IF;
            IF EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'user_memories' AND column_name = 'content'
                         AND data_type = 'character varying') THEN
                ALTER TABLE user_memories ALTER COLUMN content TYPE text;
            END IF;
            IF EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'subtask' AND column_name = 'error_message'
                         AND data_type = 'character varying') THEN
                ALTER TABLE subtask ALTER COLUMN error_message TYPE text;
            END IF;
        END $$;
        """
    )

    # ── 1c. 列宽（加宽直接改；收窄带数据长度守卫）──
    op.execute(
        """
        DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'artifact' AND column_name = 'sub_task_id'
                         AND character_maximum_length = 36) THEN
                ALTER TABLE artifact ALTER COLUMN sub_task_id TYPE varchar(64);
            END IF;
            IF EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'artifact' AND column_name = 'type'
                         AND character_maximum_length = 20) THEN
                ALTER TABLE artifact ALTER COLUMN "type" TYPE varchar(32);
            END IF;
            IF EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'artifact' AND column_name = 'language'
                         AND character_maximum_length = 50) THEN
                ALTER TABLE artifact ALTER COLUMN language TYPE varchar(64);
            END IF;
            IF EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'thread' AND column_name = 'status'
                         AND character_maximum_length = 50)
               AND (SELECT COALESCE(max(length(status)), 0) FROM thread) <= 32 THEN
                ALTER TABLE thread ALTER COLUMN status TYPE varchar(32);
            END IF;
            IF EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'thread' AND column_name = 'thread_mode'
                         AND character_maximum_length = 50)
               AND (SELECT COALESCE(max(length(thread_mode)), 0) FROM thread) <= 16 THEN
                ALTER TABLE thread ALTER COLUMN thread_mode TYPE varchar(16);
            END IF;
        END $$;
        """
    )

    # ── 1d. JSONB → JSON ──
    op.execute(
        """
        DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'message' AND column_name = 'extra_data'
                         AND data_type = 'jsonb') THEN
                ALTER TABLE message ALTER COLUMN extra_data TYPE json USING extra_data::json;
            END IF;
        END $$;
        """
    )

    # ── 2. SET NOT NULL（守卫：有 NULL 则跳过，数据问题留给 check 暴露）──
    op.execute(
        """
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM artifact WHERE sort_order IS NULL) THEN
                ALTER TABLE artifact ALTER COLUMN sort_order SET NOT NULL;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM artifact WHERE created_at IS NULL) THEN
                ALTER TABLE artifact ALTER COLUMN created_at SET NOT NULL;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM subtask WHERE sort_order IS NULL) THEN
                ALTER TABLE subtask ALTER COLUMN sort_order SET NOT NULL;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM subtask WHERE task_description IS NULL) THEN
                ALTER TABLE subtask ALTER COLUMN task_description SET NOT NULL;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM executionplan WHERE status IS NULL) THEN
                ALTER TABLE executionplan ALTER COLUMN status SET NOT NULL;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM systemexpert WHERE is_dynamic IS NULL) THEN
                ALTER TABLE systemexpert ALTER COLUMN is_dynamic SET NOT NULL;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM systemexpert WHERE is_system IS NULL) THEN
                ALTER TABLE systemexpert ALTER COLUMN is_system SET NOT NULL;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM mcp_servers WHERE transport IS NULL) THEN
                ALTER TABLE mcp_servers ALTER COLUMN transport SET NOT NULL;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM thread WHERE status IS NULL) THEN
                ALTER TABLE thread ALTER COLUMN status SET NOT NULL;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM thread WHERE thread_mode IS NULL) THEN
                ALTER TABLE thread ALTER COLUMN thread_mode SET NOT NULL;
            END IF;
        END $$;
        """
    )

    # ── 3a. share_token：先删重复的非唯一 token_hash 索引（守卫非唯一，
    #         空库链上建出来的唯一索引不得误删），再把唯一索引改到约定名 ──
    op.execute(
        """
        DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM pg_index
                       WHERE indexrelid = 'idx_share_token_token_hash'::regclass
                         AND NOT indisunique) THEN
                DROP INDEX idx_share_token_token_hash;
            END IF;
        END $$;
        """
    )

    # ── 3b. 索引改名（旧名在 + 新名不在 + 在正确表上）──
    op.execute(
        """
        DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='ix_message_conversation_id' AND tablename='message') THEN
                IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_message_thread_id') THEN
                    DROP INDEX ix_message_conversation_id;
                ELSE
                    ALTER INDEX ix_message_conversation_id RENAME TO idx_message_thread_id;
                END IF;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='ix_conversation_user_id' AND tablename='thread') THEN
                IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_thread_user_id') THEN
                    DROP INDEX ix_conversation_user_id;
                ELSE
                    ALTER INDEX ix_conversation_user_id RENAME TO idx_thread_user_id;
                END IF;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='ix_conversation_task_session_id' AND tablename='thread') THEN
                IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_thread_execution_plan_id') THEN
                    DROP INDEX ix_conversation_task_session_id;
                ELSE
                    ALTER INDEX ix_conversation_task_session_id RENAME TO idx_thread_execution_plan_id;
                END IF;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='ix_subtask_expert_type' AND tablename='subtask') THEN
                IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_subtask_expert_type') THEN
                    DROP INDEX ix_subtask_expert_type;
                ELSE
                    ALTER INDEX ix_subtask_expert_type RENAME TO idx_subtask_expert_type;
                END IF;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='ix_subtask_task_session_id' AND tablename='subtask') THEN
                IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_subtask_execution_plan_id') THEN
                    DROP INDEX ix_subtask_task_session_id;
                ELSE
                    ALTER INDEX ix_subtask_task_session_id RENAME TO idx_subtask_execution_plan_id;
                END IF;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='ix_share_token_artifact_id' AND tablename='share_token') THEN
                IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_share_token_artifact_id') THEN
                    DROP INDEX ix_share_token_artifact_id;
                ELSE
                    ALTER INDEX ix_share_token_artifact_id RENAME TO idx_share_token_artifact_id;
                END IF;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='ix_share_token_created_by' AND tablename='share_token') THEN
                IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_share_token_created_by') THEN
                    DROP INDEX ix_share_token_created_by;
                ELSE
                    ALTER INDEX ix_share_token_created_by RENAME TO idx_share_token_created_by;
                END IF;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='ix_share_token_token_hash' AND tablename='share_token') THEN
                IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_share_token_token_hash') THEN
                    DROP INDEX ix_share_token_token_hash;
                ELSE
                    ALTER INDEX ix_share_token_token_hash RENAME TO idx_share_token_token_hash;
                END IF;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='ix_mcp_servers_name' AND tablename='mcp_servers') THEN
                IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_mcp_servers_name') THEN
                    DROP INDEX ix_mcp_servers_name;
                ELSE
                    ALTER INDEX ix_mcp_servers_name RENAME TO idx_mcp_servers_name;
                END IF;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='ix_user_memories_user_id' AND tablename='user_memories') THEN
                IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_user_memories_user_id') THEN
                    DROP INDEX ix_user_memories_user_id;
                ELSE
                    ALTER INDEX ix_user_memories_user_id RENAME TO idx_user_memories_user_id;
                END IF;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_auditlog_created_at' AND tablename='auditlog') THEN
                IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_auditlog_created') THEN
                    DROP INDEX idx_auditlog_created_at;
                ELSE
                    ALTER INDEX idx_auditlog_created_at RENAME TO idx_auditlog_created;
                END IF;
            END IF;
        END $$;
        """
    )

    # ── 3c. 模型未声明的旧索引（改名表时代的遗留）删除 ──
    op.execute("DROP INDEX IF EXISTS ix_conversation_agent_id")
    op.execute("DROP INDEX IF EXISTS ix_conversation_agent_type")
    op.execute("DROP INDEX IF EXISTS ix_thread_status")
    op.execute("DROP INDEX IF EXISTS ix_thread_thread_mode")
    op.execute("DROP INDEX IF EXISTS ix_subtask_status")
    op.execute("DROP INDEX IF EXISTS idx_mcp_servers_created_at")

    # ── 4. 死列与历史注释 ──
    op.execute("ALTER TABLE subtask DROP COLUMN IF EXISTS artifacts")
    op.execute("COMMENT ON COLUMN mcp_servers.sse_url IS NULL")
    op.execute("COMMENT ON COLUMN mcp_servers.connection_status IS NULL")
    op.execute("COMMENT ON TABLE mcp_servers IS NULL")


def downgrade() -> None:
    # 类型对齐类迁移：反向不恢复历史脏类型/死列（无数据损失，无需可逆）。
    pass
