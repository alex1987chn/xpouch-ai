"""全站词汇收敛：同义双名五对列改名 + SubTask 落语义 task_id 列 + 提示词教材更新

Revision ID: 20260922_000200
Revises: 20260922_000100
Create Date: 2026-09-22

内容（2026-09-22 词汇收敛专项）：
1. 列改名（canonical 名以高频侧/schema 侧为准）：
   - subtask.task_description -> description（其余四套形状均叫 description）
   - executionplan.plan_summary -> strategy（Commander schema 名为 canonical）
   - message.timestamp / runevent.timestamp -> created_at（其余 13 表均为 created_at；
     SSE 事件 payload 的 timestamp 协议键不属本列范畴，未动）
   - systemexpert.expert_key -> expert_type（任务/事件侧 52 文件用 expert_type）
2. 同名索引跟随改名（4 个）
3. SubTask 新增 task_id 列（Commander 语义 ID 落库——此前只在内存桥接，修订重建
   任务行后 ID 无延续性；落列后修订 diff 可按 ID 对齐。注意 depends_on 列存的
   是解析后的 UUID，与 task_id 语义 ID 是两个命名空间）
4. 数据迁移：systemexpert.commander 提示词——dependencies -> depends_on（删
   AliasChoices 容错的前提：先改教材），并删除 priority 教学（该字段已从输出
   schema 移除，教而不收）

⚠️ 守卫说明：全部操作带存在性判断——历史分叉实测（2026-09-22）：空库链的
systemexpert 键列从 001 起就叫 expert_type，而 create_all 时代老库叫 expert_key，
两条历史在此汇合，UPDATE/RENAME 必须双兼容。
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260922_000200"
down_revision: str | None = "20260922_000100"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _rename_column_if_exists(table: str, old: str, new: str) -> None:
    op.execute(
        f"DO $$ BEGIN "
        f"IF EXISTS (SELECT 1 FROM information_schema.columns "
        f"WHERE table_name = '{table}' AND column_name = '{old}') THEN "
        f'ALTER TABLE "{table}" RENAME COLUMN "{old}" TO "{new}"; '
        f"END IF; END $$;"
    )


def _rename_index_if_exists(old: str, new: str) -> None:
    op.execute(
        f"DO $$ BEGIN "
        f"IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = '{old}') THEN "
        f'ALTER INDEX "{old}" RENAME TO "{new}"; '
        f"END IF; END $$;"
    )


def upgrade() -> None:
    # 4. 教材先行（老库列叫 expert_key、空库链从 001 起就叫 expert_type，双分支）
    op.execute(
        "DO $$ BEGIN "
        "IF EXISTS (SELECT 1 FROM information_schema.columns "
        "WHERE table_name = 'systemexpert' AND column_name = 'expert_key') THEN "
        'UPDATE "systemexpert" SET "system_prompt" = replace("system_prompt", '
        "'dependencies', 'depends_on') WHERE \"expert_key\" = 'commander'; "
        'UPDATE "systemexpert" SET "system_prompt" = regexp_replace("system_prompt", '
        "'\"priority\"\\s*:\\s*\\d+,?\\s*', '', 'g') WHERE \"expert_key\" = 'commander'; "
        "ELSIF EXISTS (SELECT 1 FROM information_schema.columns "
        "WHERE table_name = 'systemexpert' AND column_name = 'expert_type') THEN "
        'UPDATE "systemexpert" SET "system_prompt" = replace("system_prompt", '
        "'dependencies', 'depends_on') WHERE \"expert_type\" = 'commander'; "
        'UPDATE "systemexpert" SET "system_prompt" = regexp_replace("system_prompt", '
        "'\"priority\"\\s*:\\s*\\d+,?\\s*', '', 'g') WHERE \"expert_type\" = 'commander'; "
        "END IF; END $$;"
    )

    # 1. 列改名（守卫式）
    _rename_column_if_exists("subtask", "task_description", "description")
    _rename_column_if_exists("executionplan", "plan_summary", "strategy")
    _rename_column_if_exists("message", "timestamp", "created_at")
    _rename_column_if_exists("runevent", "timestamp", "created_at")
    _rename_column_if_exists("systemexpert", "expert_key", "expert_type")

    # 2. 索引跟随（守卫式）
    _rename_index_if_exists("idx_message_thread_timestamp", "idx_message_thread_created_at")
    _rename_index_if_exists("idx_runevent_run_id_timestamp", "idx_runevent_run_id_created_at")
    _rename_index_if_exists("idx_subtask_task_description", "idx_subtask_description")
    _rename_index_if_exists("idx_systemexpert_expert_key", "idx_systemexpert_expert_type")

    # 3. SubTask 语义 task_id 落列
    op.execute('ALTER TABLE "subtask" ADD COLUMN IF NOT EXISTS "task_id" VARCHAR(64)')
    op.execute('CREATE INDEX IF NOT EXISTS "idx_subtask_task_id" ON "subtask" ("task_id")')


def downgrade() -> None:
    op.execute('DROP INDEX IF EXISTS "idx_subtask_task_id"')
    op.execute('ALTER TABLE "subtask" DROP COLUMN IF EXISTS "task_id"')
    _rename_index_if_exists("idx_systemexpert_expert_type", "idx_systemexpert_expert_key")
    _rename_index_if_exists("idx_subtask_description", "idx_subtask_task_description")
    _rename_index_if_exists("idx_runevent_run_id_created_at", "idx_runevent_run_id_timestamp")
    _rename_index_if_exists("idx_message_thread_created_at", "idx_message_thread_timestamp")
    _rename_column_if_exists("systemexpert", "expert_type", "expert_key")
    _rename_column_if_exists("runevent", "created_at", "timestamp")
    _rename_column_if_exists("message", "created_at", "timestamp")
    _rename_column_if_exists("executionplan", "strategy", "plan_summary")
    _rename_column_if_exists("subtask", "description", "task_description")
