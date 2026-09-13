"""Baseline schema — 001–004 的合并（squash）

Revision ID: 001
Revises:
Create Date: 2026-03-02 13:44:00.000000

[为什么合并]
原 001–004 属「create_all 时代」：001 手写 DDL 建表，002 修字段类型 / 加 updated_at
触发器 / 改级联删除，003 补 tasksession.plan_version，004 加三个查询索引。它们默认
表已由 `SQLModel.metadata.create_all` 建好，因而自带漂移（例如 001 漏了 customagent
的时间戳列）。v3.5.0 把 create_all 退役后，全新安装只走 Alembic，迁移链在空库上
**跑不到 head**（004 在 customagent.created_at 上建索引即 UndefinedColumn），
即全新部署起不来。

本文件合并这四步，内容是 **004 执行完毕时的 schema**；等价性用 pg_dump 结构指纹
（列/类型/可空/默认值、索引定义、约束定义、触发器）逐行比对证明。005 及之后的
迁移一字未改，链尾 revision 不变。

[对存量库的影响]
无。Alembic 按 revision id 记账，存量库 alembic_version 记的是链尾而非 001，不会
重跑本文件。唯一例外：若某个库停在 001–004 之间的中间态，squash 后这些 revision
已不存在，需先把它修正到链尾再升级。
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector

# revision identifiers, used by Alembic.
revision: str = "001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ======================================================================
    # user
    # ======================================================================
    op.create_table(
        "user",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("username", sa.String(), nullable=False),
        sa.Column("avatar", sa.String(), nullable=True),
        sa.Column("plan", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("phone_number", sa.String(), nullable=True),
        sa.Column("email", sa.String(), nullable=True),
        sa.Column("password_hash", sa.String(), nullable=True),
        sa.Column("verification_code", sa.String(), nullable=True),
        sa.Column("verification_code_expires_at", sa.DateTime(), nullable=True),
        sa.Column("auth_provider", sa.String(), nullable=True),
        sa.Column("provider_id", sa.String(), nullable=True),
        sa.Column("access_token", sa.String(), nullable=True),
        sa.Column("refresh_token", sa.String(), nullable=True),
        sa.Column("token_expires_at", sa.DateTime(), nullable=True),
        sa.Column("is_verified", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_user_email"), "user", ["email"], unique=True)
    op.create_index(op.f("ix_user_phone_number"), "user", ["phone_number"], unique=True)
    op.create_index(op.f("ix_user_provider_id"), "user", ["provider_id"], unique=False)

    # ======================================================================
    # thread
    # ======================================================================
    op.create_table(
        "thread",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("agent_type", sa.String(), nullable=False),
        sa.Column("agent_id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("task_session_id", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("thread_mode", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["user.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_thread_agent_id"), "thread", ["agent_id"], unique=False)
    op.create_index(op.f("ix_thread_agent_type"), "thread", ["agent_type"], unique=False)
    op.create_index(op.f("ix_thread_status"), "thread", ["status"], unique=False)
    op.create_index(op.f("ix_thread_task_session_id"), "thread", ["task_session_id"], unique=False)
    op.create_index(op.f("ix_thread_thread_mode"), "thread", ["thread_mode"], unique=False)
    op.create_index(op.f("ix_thread_user_id"), "thread", ["user_id"], unique=False)

    # ======================================================================
    # message
    # ======================================================================
    op.create_table(
        "message",
        sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("thread_id", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("timestamp", sa.DateTime(), nullable=False),
        sa.Column("extra_data", sa.JSON(), nullable=True),
        sa.ForeignKeyConstraint(["thread_id"], ["thread.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_message_thread_id"), "message", ["thread_id"], unique=False)
    op.create_index(
        "idx_message_thread_timestamp", "message", ["thread_id", "timestamp"], unique=False
    )

    # ======================================================================
    # customagent（外键在 002 里改成 ON DELETE CASCADE，baseline 直接建成终态）
    # ======================================================================
    op.create_table(
        "customagent",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("system_prompt", sa.String(), nullable=False),
        sa.Column("model_id", sa.String(), nullable=False),
        sa.Column("is_default", sa.Boolean(), nullable=False),
        sa.Column("category", sa.String(), nullable=True),
        sa.Column("is_public", sa.Boolean(), nullable=True),
        sa.Column("conversation_count", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["user.id"],
            name="customagent_user_id_fkey",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_customagent_is_default"), "customagent", ["is_default"], unique=False)
    op.create_index(op.f("ix_customagent_name"), "customagent", ["name"], unique=False)
    op.create_index(op.f("ix_customagent_user_id"), "customagent", ["user_id"], unique=False)

    # ======================================================================
    # tasksession（plan_version 由 003 补入，baseline 直接建成终态：非空、列在末尾）
    # ======================================================================
    op.create_table(
        "tasksession",
        sa.Column("session_id", sa.String(), nullable=False),
        sa.Column("thread_id", sa.String(), nullable=False),
        sa.Column("user_query", sa.String(), nullable=False),
        sa.Column("final_response", sa.String(), nullable=True),
        sa.Column("plan_summary", sa.String(), nullable=True),
        sa.Column("estimated_steps", sa.Integer(), nullable=True),
        sa.Column("execution_mode", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("plan_version", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["thread_id"], ["thread.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("session_id"),
    )
    op.create_index(op.f("ix_tasksession_thread_id"), "tasksession", ["thread_id"], unique=False)

    # ======================================================================
    # subtask
    # ======================================================================
    op.create_table(
        "subtask",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("task_session_id", sa.String(), nullable=False),
        sa.Column("expert_type", sa.String(), nullable=False),
        sa.Column("task_description", sa.String(), nullable=True),
        sa.Column("output_result", sa.JSON(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=True),
        sa.Column("execution_mode", sa.String(), nullable=True),
        sa.Column("depends_on", sa.JSON(), nullable=True),
        sa.Column("error_message", sa.String(), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["task_session_id"], ["tasksession.session_id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_subtask_session_status"), "subtask", ["task_session_id", "status"], unique=False
    )
    op.create_index(op.f("ix_subtask_sort_order"), "subtask", ["sort_order"], unique=False)
    op.create_index(op.f("ix_subtask_status"), "subtask", ["status"], unique=False)

    # ======================================================================
    # artifact
    # ======================================================================
    op.create_table(
        "artifact",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("sub_task_id", sa.String(), nullable=False),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("language", sa.String(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["sub_task_id"], ["subtask.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_artifact_sub_task_id"), "artifact", ["sub_task_id"], unique=False)
    op.create_index(op.f("ix_artifact_type"), "artifact", ["type"], unique=False)

    # ======================================================================
    # systemexpert
    # ======================================================================
    op.create_table(
        "systemexpert",
        sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("expert_key", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("system_prompt", sa.String(), nullable=False),
        sa.Column("model", sa.String(), nullable=False),
        sa.Column("temperature", sa.Float(), nullable=False),
        sa.Column("is_dynamic", sa.Boolean(), nullable=True),
        sa.Column("is_system", sa.Boolean(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("expert_key"),
    )
    op.create_index(op.f("ix_systemexpert_expert_key"), "systemexpert", ["expert_key"], unique=True)

    # ======================================================================
    # user_memories（pgvector 扩展必须先启用；embedding/created_at 在 002 里被重建，
    # 所以列顺序落在末尾——baseline 按同一顺序声明，保持与存量库一致）
    # ======================================================================
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.create_table(
        "user_memories",
        sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("source", sa.String(), nullable=False),
        sa.Column("memory_type", sa.String(), nullable=False),
        sa.Column("embedding", Vector(1024), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_user_memories_user_id"), "user_memories", ["user_id"], unique=False)

    # ======================================================================
    # mcp_servers
    # ======================================================================
    op.create_table(
        "mcp_servers",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("sse_url", sa.String(), nullable=False),
        sa.Column("transport", sa.String(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("icon", sa.String(), nullable=True),
        sa.Column("connection_status", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("sse_url"),
    )
    op.create_index(op.f("ix_mcp_servers_is_active"), "mcp_servers", ["is_active"], unique=False)
    op.create_index(op.f("ix_mcp_servers_name"), "mcp_servers", ["name"], unique=False)

    # ======================================================================
    # 004 补充的三个查询索引
    # ======================================================================
    op.create_index(
        op.f("idx_thread_user_updated"), "thread", ["user_id", "updated_at"], unique=False
    )
    op.create_index(
        op.f("idx_customagent_user_default_created"),
        "customagent",
        ["user_id", "is_default", "created_at"],
        unique=False,
    )
    op.create_index(
        op.f("idx_tasksession_thread_created"),
        "tasksession",
        ["thread_id", "created_at"],
        unique=False,
    )

    # ======================================================================
    # updated_at 自动维护（002 引入）
    #
    # 固定白名单表 + **纯字面量 SQL**：不拼接、不格式化、不传变量（与 002 的写法保持
    # 一致，也让静态扫描器无需猜测）。触发器名与 002 相同——存量库里就是这些名字；
    # tasksession 后续会被重命名为 executionplan，触发器随表走、名字不变。
    # ======================================================================
    op.execute("""
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
    """)

    op.execute('DROP TRIGGER IF EXISTS trg_user_updated_at ON "user"')
    op.execute(
        'CREATE TRIGGER trg_user_updated_at BEFORE UPDATE ON "user" '
        "FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()"
    )
    op.execute('DROP TRIGGER IF EXISTS trg_thread_updated_at ON "thread"')
    op.execute(
        'CREATE TRIGGER trg_thread_updated_at BEFORE UPDATE ON "thread" '
        "FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()"
    )
    op.execute('DROP TRIGGER IF EXISTS trg_customagent_updated_at ON "customagent"')
    op.execute(
        'CREATE TRIGGER trg_customagent_updated_at BEFORE UPDATE ON "customagent" '
        "FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()"
    )
    op.execute('DROP TRIGGER IF EXISTS trg_subtask_updated_at ON "subtask"')
    op.execute(
        'CREATE TRIGGER trg_subtask_updated_at BEFORE UPDATE ON "subtask" '
        "FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()"
    )
    op.execute('DROP TRIGGER IF EXISTS trg_tasksession_updated_at ON "tasksession"')
    op.execute(
        'CREATE TRIGGER trg_tasksession_updated_at BEFORE UPDATE ON "tasksession" '
        "FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()"
    )
    op.execute('DROP TRIGGER IF EXISTS trg_systemexpert_updated_at ON "systemexpert"')
    op.execute(
        'CREATE TRIGGER trg_systemexpert_updated_at BEFORE UPDATE ON "systemexpert" '
        "FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()"
    )
    op.execute('DROP TRIGGER IF EXISTS trg_mcp_servers_updated_at ON "mcp_servers"')
    op.execute(
        'CREATE TRIGGER trg_mcp_servers_updated_at BEFORE UPDATE ON "mcp_servers" '
        "FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()"
    )


def downgrade() -> None:
    # 触发器按固定白名单逐条删除（纯字面量 SQL，同 upgrade）
    op.execute('DROP TRIGGER IF EXISTS trg_user_updated_at ON "user"')
    op.execute('DROP TRIGGER IF EXISTS trg_thread_updated_at ON "thread"')
    op.execute('DROP TRIGGER IF EXISTS trg_customagent_updated_at ON "customagent"')
    op.execute('DROP TRIGGER IF EXISTS trg_subtask_updated_at ON "subtask"')
    op.execute('DROP TRIGGER IF EXISTS trg_tasksession_updated_at ON "tasksession"')
    op.execute('DROP TRIGGER IF EXISTS trg_systemexpert_updated_at ON "systemexpert"')
    op.execute('DROP TRIGGER IF EXISTS trg_mcp_servers_updated_at ON "mcp_servers"')
    op.execute("DROP FUNCTION IF EXISTS update_updated_at_column()")

    op.drop_table("mcp_servers")
    op.drop_table("user_memories")
    op.drop_table("systemexpert")
    op.drop_table("artifact")
    op.drop_table("subtask")
    op.drop_table("tasksession")
    op.drop_table("customagent")
    op.drop_table("message")
    op.drop_table("thread")
    op.drop_table("user")
