"""Standardize enum storage and string length constraints.

Revision ID: 20260304_180000
Revises: 005
Create Date: 2026-03-04 18:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260304_180000"
down_revision: str | None = "005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


user_role_enum = sa.Enum("user", "admin", "view_admin", "edit_admin", name="user_role_enum")
conversation_type_enum = sa.Enum("default", "custom", "ai", name="conversation_type_enum")
task_status_enum = sa.Enum(
    "pending", "running", "completed", "failed", "cancelled", name="task_status_enum"
)
execution_mode_enum = sa.Enum("sequential", "parallel", name="execution_mode_enum")


def _alter_to_enum_with_fallback(
    table_name: str,
    column_name: str,
    enum_name: str,
    allowed_values: tuple[str, ...],
    fallback_value: str,
) -> None:
    allowed_sql = ", ".join(f"'{value}'" for value in allowed_values)

    # P0 修复: 先删除默认值，改完类型再加回来（避免 PostgreSQL 无法自动转换默认值）
    op.execute(sa.text(f'ALTER TABLE "{table_name}" ALTER COLUMN {column_name} DROP DEFAULT'))

    op.execute(
        sa.text(
            f"""
            ALTER TABLE "{table_name}"
            ALTER COLUMN {column_name}
            TYPE {enum_name}
            USING (
                CASE
                    WHEN {column_name} IN ({allowed_sql}) THEN {column_name}::{enum_name}
                    ELSE '{fallback_value}'::{enum_name}
                END
            )
            """
        )
    )

    # 恢复默认值
    op.execute(sa.text(f'ALTER TABLE "{table_name}" ALTER COLUMN {column_name} SET DEFAULT \'{fallback_value}\'::{enum_name}'))


def upgrade() -> None:
    bind = op.get_bind()
    user_role_enum.create(bind, checkfirst=True)
    conversation_type_enum.create(bind, checkfirst=True)
    task_status_enum.create(bind, checkfirst=True)
    execution_mode_enum.create(bind, checkfirst=True)

    # DB-12: 枚举列统一收敛为 PostgreSQL ENUM（兼容异常历史值，提供回退）
    _alter_to_enum_with_fallback(
        table_name="user",
        column_name="role",
        enum_name="user_role_enum",
        allowed_values=("user", "admin", "view_admin", "edit_admin"),
        fallback_value="user",
    )
    _alter_to_enum_with_fallback(
        table_name="thread",
        column_name="agent_type",
        enum_name="conversation_type_enum",
        allowed_values=("default", "custom", "ai"),
        fallback_value="default",
    )
    _alter_to_enum_with_fallback(
        table_name="subtask",
        column_name="status",
        enum_name="task_status_enum",
        allowed_values=("pending", "running", "completed", "failed", "cancelled"),
        fallback_value="pending",
    )
    _alter_to_enum_with_fallback(
        table_name="tasksession",
        column_name="status",
        enum_name="task_status_enum",
        allowed_values=("pending", "running", "completed", "failed", "cancelled"),
        fallback_value="pending",
    )
    _alter_to_enum_with_fallback(
        table_name="subtask",
        column_name="execution_mode",
        enum_name="execution_mode_enum",
        allowed_values=("sequential", "parallel"),
        fallback_value="sequential",
    )
    _alter_to_enum_with_fallback(
        table_name="tasksession",
        column_name="execution_mode",
        enum_name="execution_mode_enum",
        allowed_values=("sequential", "parallel"),
        fallback_value="sequential",
    )

    # DB-13: 关键字符串字段补齐长度约束
    op.alter_column("user", "username", type_=sa.String(length=50))
    op.alter_column("user", "plan", type_=sa.String(length=20))
    op.alter_column("user", "phone_number", type_=sa.String(length=32))
    op.alter_column("user", "email", type_=sa.String(length=254))
    op.alter_column("user", "password_hash", type_=sa.String(length=255))
    op.alter_column("user", "verification_code", type_=sa.String(length=16))
    op.alter_column("user", "auth_provider", type_=sa.String(length=32))
    op.alter_column("user", "provider_id", type_=sa.String(length=128))

    op.alter_column("systemexpert", "expert_key", type_=sa.String(length=64))
    op.alter_column("systemexpert", "name", type_=sa.String(length=255))
    op.alter_column("systemexpert", "model", type_=sa.String(length=128))

    op.alter_column("thread", "title", type_=sa.String(length=512))
    op.alter_column("thread", "agent_id", type_=sa.String(length=128))
    op.alter_column("thread", "user_id", type_=sa.String(length=64))
    op.alter_column("thread", "task_session_id", type_=sa.String(length=64))
    op.alter_column("thread", "status", type_=sa.String(length=32))
    op.alter_column("thread", "thread_mode", type_=sa.String(length=16))

    op.alter_column("message", "thread_id", type_=sa.String(length=64))
    op.alter_column("message", "role", type_=sa.String(length=20))

    op.alter_column("customagent", "user_id", type_=sa.String(length=64))
    op.alter_column("customagent", "name", type_=sa.String(length=255))
    op.alter_column("customagent", "model_id", type_=sa.String(length=128))
    op.alter_column("customagent", "category", type_=sa.String(length=64))

    op.alter_column("subtask", "task_session_id", type_=sa.String(length=64))
    op.alter_column("subtask", "expert_type", type_=sa.String(length=64))

    op.alter_column("tasksession", "thread_id", type_=sa.String(length=64))

    op.alter_column("artifact", "sub_task_id", type_=sa.String(length=64))
    op.alter_column("artifact", "type", type_=sa.String(length=32))
    op.alter_column("artifact", "title", type_=sa.String(length=255))
    op.alter_column("artifact", "language", type_=sa.String(length=64))


def downgrade() -> None:
    # 先恢复长度约束（回退为不指定长度）
    op.alter_column("user", "username", type_=sa.String())
    op.alter_column("user", "plan", type_=sa.String())
    op.alter_column("user", "phone_number", type_=sa.String())
    op.alter_column("user", "email", type_=sa.String())
    op.alter_column("user", "password_hash", type_=sa.String())
    op.alter_column("user", "verification_code", type_=sa.String())
    op.alter_column("user", "auth_provider", type_=sa.String())
    op.alter_column("user", "provider_id", type_=sa.String())

    op.alter_column("systemexpert", "expert_key", type_=sa.String())
    op.alter_column("systemexpert", "name", type_=sa.String())
    op.alter_column("systemexpert", "model", type_=sa.String())

    op.alter_column("thread", "title", type_=sa.String())
    op.alter_column("thread", "agent_id", type_=sa.String())
    op.alter_column("thread", "user_id", type_=sa.String())
    op.alter_column("thread", "task_session_id", type_=sa.String())
    op.alter_column("thread", "status", type_=sa.String())
    op.alter_column("thread", "thread_mode", type_=sa.String())

    op.alter_column("message", "thread_id", type_=sa.String())
    op.alter_column("message", "role", type_=sa.String())

    op.alter_column("customagent", "user_id", type_=sa.String())
    op.alter_column("customagent", "name", type_=sa.String())
    op.alter_column("customagent", "model_id", type_=sa.String())
    op.alter_column("customagent", "category", type_=sa.String())

    op.alter_column("subtask", "task_session_id", type_=sa.String())
    op.alter_column("subtask", "expert_type", type_=sa.String())

    op.alter_column("tasksession", "thread_id", type_=sa.String())

    op.alter_column("artifact", "sub_task_id", type_=sa.String())
    op.alter_column("artifact", "type", type_=sa.String())
    op.alter_column("artifact", "title", type_=sa.String())
    op.alter_column("artifact", "language", type_=sa.String())

    # 再将 ENUM 列回退为 VARCHAR
    op.execute(sa.text('ALTER TABLE "user" ALTER COLUMN role TYPE VARCHAR USING role::text'))
    op.execute(sa.text('ALTER TABLE "thread" ALTER COLUMN agent_type TYPE VARCHAR USING agent_type::text'))
    op.execute(sa.text('ALTER TABLE "subtask" ALTER COLUMN status TYPE VARCHAR USING status::text'))
    op.execute(sa.text('ALTER TABLE "tasksession" ALTER COLUMN status TYPE VARCHAR USING status::text'))
    op.execute(
        sa.text('ALTER TABLE "subtask" ALTER COLUMN execution_mode TYPE VARCHAR USING execution_mode::text')
    )
    op.execute(
        sa.text('ALTER TABLE "tasksession" ALTER COLUMN execution_mode TYPE VARCHAR USING execution_mode::text')
    )

    bind = op.get_bind()
    execution_mode_enum.drop(bind, checkfirst=True)
    task_status_enum.drop(bind, checkfirst=True)
    conversation_type_enum.drop(bind, checkfirst=True)
    user_role_enum.drop(bind, checkfirst=True)
