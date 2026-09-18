"""删除链路外键补级联：run_stream_frame / share_token / user_settings

Revision ID: 20260918_000300
Revises: 20260918_000200
Create Date: 2026-09-18

背景：删会话级联删 AgentRun 时炸 FK（run_stream_frame 仍有该 run 的帧，
约束无 ondelete）。全外键扫描发现三个同型隐患，统一补 ON DELETE：

1. run_stream_frame.run_id → agentrun.id   CASCADE（帧依附于 run）
2. share_token.artifact_id → artifact.id   CASCADE（产物删则分享链接失效）
3. user_settings.user_id   → user.id       CASCADE（偏好随用户删除）

约束名若非默认命名则动态查取；已改过（幂等重放）则跳过。
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260918_000300"
down_revision: str | None = "20260918_000200"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# (表, 列, 引用表, 目标 ondelete)
_CASCADE_TARGETS = [
    ("run_stream_frame", "run_id", "agentrun", "CASCADE"),
    ("share_token", "artifact_id", "artifact", "CASCADE"),
    ("user_settings", "user_id", "user", "CASCADE"),
]


def upgrade() -> None:
    for table_name, column_name, ref_table, on_delete in _CASCADE_TARGETS:
        op.execute(
            f"""
            DO $$ DECLARE
                v_constraint_name text;
            BEGIN
                -- 动态查该列的 FK 约束名（默认命名可能因历史而异）
                SELECT rc.constraint_name INTO v_constraint_name
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                  ON tc.constraint_name = kcu.constraint_name
                 AND tc.table_schema = kcu.table_schema
                JOIN information_schema.referential_constraints rc
                  ON rc.constraint_name = tc.constraint_name
                 AND rc.constraint_schema = tc.table_schema
                WHERE tc.constraint_type = 'FOREIGN KEY'
                  AND tc.table_name = '{table_name}'
                  AND kcu.column_name = '{column_name}'
                LIMIT 1;

                IF v_constraint_name IS NULL THEN
                    RETURN;  -- 无 FK（不该发生）或已处理过
                END IF;

                -- 已带 CASCADE 则跳过（幂等）
                IF EXISTS (
                    SELECT 1 FROM information_schema.referential_constraints
                    WHERE constraint_name = v_constraint_name
                      AND update_rule = 'CASCADE' AND delete_rule = 'CASCADE'
                ) THEN
                    RETURN;
                END IF;

                EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', '{table_name}', v_constraint_name);
                EXECUTE format(
                    'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE {on_delete}',
                    '{table_name}', v_constraint_name, '{column_name}', '{ref_table}'
                );
            END $$;
            """
        )


def downgrade() -> None:
    # 不降级（级联是正确的所有权语义；回退会重新引入删除炸 FK 的问题）
    pass
