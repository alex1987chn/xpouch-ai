"""协调 thread 子树外键为级联删除（修复历史漂移）。

背景（2026-09-03 排查）：
- 迁移历史（001）里 thread 子表外键均为 ON DELETE CASCADE，
  但线上库实际是 SQLModel create_all 时代生成的 NO ACTION 约束（迁移史之外的漂移）。
- 后果：SessionCleanup 删除过期线程时被外键阻塞，整轮清理事务回滚——
  过期线程清理在旧库上从未成功过（每小时告警一次）。
- 本迁移将 thread 删除子树所需的约束统一为 CASCADE / SET NULL，幂等：
  已处于目标状态的约束自动跳过（新建库走 001 后本身即 CASCADE，不受影响）。

约束清单（child.column -> parent，目标动作）：
- message.thread_id -> thread                CASCADE
- tasksession.thread_id -> thread            CASCADE（历史死表，无模型，仅清数据）
- agentrun.thread_id -> thread               CASCADE
- executionplan.thread_id -> thread          CASCADE
- subtask.execution_plan_id -> executionplan CASCADE
- executionplan.run_id -> agentrun           CASCADE
- agentrun.retry_of_run_id -> agentrun       SET NULL（保留重试运行记录，仅解除引用）
- 重复约束 fk_executionplan_run_id_agentrun（与 executionplan_run_id_fkey 同列）整体删除

写法说明：
- 条件 DDL（读 pg_get_constraintdef 判断后决定是否 ALTER）在 PostgreSQL 中必须用动态
  SQL，故整体放在 DO 块内；约束名/表名均为本文件白名单常量，非外部输入。
- 动态语句用字符串连接 + quote_ident 构造（不用 plpgsql format），
  避免 Alembic/psycopg 对百分号占位符的转义歧义。
"""

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260903_094500"
down_revision: str | None = "20260902_120000"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "DO $$ "
        "DECLARE rec record; child_table text; parent_table text; "
        "child_col text; parent_col text; defn text; "
        "BEGIN "
        # 1) 删除重复约束（与 executionplan_run_id_fkey 同列，双动作语义冲突）
        "IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_executionplan_run_id_agentrun') THEN "
        "ALTER TABLE executionplan DROP CONSTRAINT fk_executionplan_run_id_agentrun; "
        "END IF; "
        # 2) 逐个协调到目标动作（已是目标则跳过，幂等）
        "FOR rec IN SELECT * FROM (VALUES "
        "('message_conversation_id_fkey','CASCADE'),"
        "('tasksession_conversation_id_fkey','CASCADE'),"
        "('agentrun_thread_id_fkey','CASCADE'),"
        "('executionplan_thread_id_fkey','CASCADE'),"
        "('subtask_execution_plan_id_fkey','CASCADE'),"
        "('executionplan_run_id_fkey','CASCADE'),"
        "('agentrun_retry_of_run_id_fkey','SET NULL')"
        ") AS t(conname, action) LOOP "
        "SELECT c.conrelid::regclass::text, c.confrelid::regclass::text, "
        "(SELECT a.attname FROM pg_attribute a WHERE a.attrelid = c.conrelid AND a.attnum = c.conkey[1]), "
        "(SELECT a.attname FROM pg_attribute a WHERE a.attrelid = c.confrelid AND a.attnum = c.confkey[1]), "
        "pg_get_constraintdef(c.oid, true) "
        "INTO child_table, parent_table, child_col, parent_col, defn "
        "FROM pg_constraint c "
        "WHERE c.contype = 'f' AND c.conname = rec.conname; "
        "IF NOT FOUND THEN CONTINUE; END IF; "
        "IF position('ON DELETE ' || rec.action IN defn) > 0 THEN CONTINUE; END IF; "
        "EXECUTE 'ALTER TABLE ' || child_table || ' DROP CONSTRAINT ' || quote_ident(rec.conname); "
        "EXECUTE 'ALTER TABLE ' || child_table || ' ADD CONSTRAINT ' || quote_ident(rec.conname) || "
        "' FOREIGN KEY (' || quote_ident(child_col) || ') REFERENCES ' || parent_table || "
        "'(' || quote_ident(parent_col) || ') ON DELETE ' || rec.action; "
        "END LOOP; "
        "END $$"
    )


def downgrade() -> None:
    # 还原为无动作（NO ACTION）；已无 ON DELETE 子句的约束跳过，保持幂等
    op.execute(
        "DO $$ "
        "DECLARE rec record; child_table text; parent_table text; "
        "child_col text; parent_col text; defn text; "
        "BEGIN "
        "FOR rec IN SELECT * FROM (VALUES "
        "('message_conversation_id_fkey'),"
        "('tasksession_conversation_id_fkey'),"
        "('agentrun_thread_id_fkey'),"
        "('executionplan_thread_id_fkey'),"
        "('subtask_execution_plan_id_fkey'),"
        "('executionplan_run_id_fkey'),"
        "('agentrun_retry_of_run_id_fkey')"
        ") AS t(conname) LOOP "
        "SELECT c.conrelid::regclass::text, c.confrelid::regclass::text, "
        "(SELECT a.attname FROM pg_attribute a WHERE a.attrelid = c.conrelid AND a.attnum = c.conkey[1]), "
        "(SELECT a.attname FROM pg_attribute a WHERE a.attrelid = c.confrelid AND a.attnum = c.confkey[1]), "
        "pg_get_constraintdef(c.oid, true) "
        "INTO child_table, parent_table, child_col, parent_col, defn "
        "FROM pg_constraint c "
        "WHERE c.contype = 'f' AND c.conname = rec.conname; "
        "IF NOT FOUND THEN CONTINUE; END IF; "
        "IF position('ON DELETE' IN defn) = 0 THEN CONTINUE; END IF; "
        "EXECUTE 'ALTER TABLE ' || child_table || ' DROP CONSTRAINT ' || quote_ident(rec.conname); "
        "EXECUTE 'ALTER TABLE ' || child_table || ' ADD CONSTRAINT ' || quote_ident(rec.conname) || "
        "' FOREIGN KEY (' || quote_ident(child_col) || ') REFERENCES ' || parent_table || "
        "'(' || quote_ident(parent_col) || ')'; "
        "END LOOP; "
        "END $$"
    )
