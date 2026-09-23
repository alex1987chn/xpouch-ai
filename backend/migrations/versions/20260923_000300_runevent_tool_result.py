"""runevent 账本枚举加 tool_result（工具调用可见性）

Revision ID: 20260923_000300
Revises: 20260923_000200
Create Date: 2026-09-23

专家执行期间的工具调用此前只进后端日志（SSE/时间线/回放三面全黑）。
本次为账本枚举 run_event_type_enum 追加 tool_result：时间线页按 runevent
回看时每个工具调用有一行汇总（工具名/耗时/成败）。tool.calling 实时事件
不进账本（帧通道已覆盖断线重放，回看只需 result 一行）。

ALTER TYPE ... ADD VALUE 在 PG 12+ 可在事务内执行，但同事务内不能使用新值
（本迁移只加值不插数据，无此问题）；重复执行会抛 duplicate_object，DO 块
按守卫式吞掉保证幂等。
"""

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260923_000300"
down_revision: str | None = "20260923_000200"
branch_labels = None
depends_on = None

_ENUM_NAME = "run_event_type_enum"
_NEW_VALUES = ("tool_result",)


def upgrade() -> None:
    for value in _NEW_VALUES:
        op.execute(
            f"""
            DO $$
            BEGIN
                BEGIN
                    ALTER TYPE {_ENUM_NAME} ADD VALUE '{value}';
                EXCEPTION
                    WHEN duplicate_object THEN NULL;
                END;
            END $$;
            """
        )


def downgrade() -> None:
    # PG 的 ALTER TYPE ... DROP VALUE 不存在：枚举值只能加不能删。
    # 降级到本迁移之前的版本时，多出的枚举值无害（无行引用它即可）。
    pass
