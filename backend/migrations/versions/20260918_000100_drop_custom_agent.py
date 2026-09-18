"""删除 CustomAgent 全链路：表 + 历史 custom 线程清理

Revision ID: 20260918_000100
Revises: 20260916_000200
Create Date: 2026-09-18

背景：CustomAgent（用户自定义智能体）的前端入口在 v3.4.7 改版时已退役
（创建页路由删除），后端随之悬空——没有任何路径能把 CustomAgent UUID
递到 `?agent_id=`。本迁移删除整条链路的数据痕迹：

1. 删除 customagent 表（含级联的 user 外键）。
2. 删除 agent_type='custom' 的历史线程及其消息（2 条，同一用户，
   消息量 37+14 条，已确认无保留价值）。
3. conversation_type_enum 移除 'custom' 值（线程表已无该值后枚举收窄）。

降级路径（如需回滚）：不恢复表/数据，只把代码回退到上一版本
（agent_type='custom' 的线程在旧代码里会走 router 主链路，行为不变）。
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260918_000100"
down_revision: str | None = "20260916_000200"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ── 1. 删除 customagent 表（含级联的 user 外键约束）──
    op.execute(
        """
        DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.tables
                       WHERE table_name = 'customagent' AND table_schema = 'public') THEN
                DROP TABLE customagent CASCADE;
            END IF;
        END $$;
        """
    )

    # ── 2. 删除历史 custom 线程及其消息 ──
    # 先删消息（无外键级联，需显式），再删线程
    op.execute(
        """
        DELETE FROM message WHERE thread_id IN (
            SELECT id FROM thread WHERE agent_type = 'custom'
        );
        """
    )
    op.execute("DELETE FROM thread WHERE agent_type = 'custom';")

    # ── 3. conversation_type_enum 移除 'custom' 值 ──
    # PG 枚举值删除需重建类型：改列回 varchar → 重建枚举 → 改回新枚举
    op.execute(
        """
        DO $$ BEGIN
            -- 仅当枚举里还有 'custom' 时才收窄（幂等）
            IF EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'custom'
                       AND enumtypid = 'conversation_type_enum'::regtype) THEN
                -- 先改列回 varchar（枚举 → varchar 不需要 USING）
                ALTER TABLE thread ALTER COLUMN agent_type TYPE varchar;
                -- 重建枚举（去掉 custom）
                DROP TYPE conversation_type_enum;
                CREATE TYPE conversation_type_enum AS ENUM ('default', 'ai');
                -- 改回新枚举（varchar → 新枚举需 USING 强转）
                ALTER TABLE thread ALTER COLUMN agent_type TYPE conversation_type_enum
                    USING agent_type::conversation_type_enum;
            END IF;
        END $$;
        """
    )


def downgrade() -> None:
    # 不恢复表/数据（降级路径见文件头说明）
    pass
