"""存量时间数据归一化为 UTC（P7 UTC 化）

背景与约定（utils/time.py 模块 docstring 详述）：
- v3.4.4 起 DB 时间列统一写 naive UTC（utc_now_naive），列类型保持
  naive DateTime 不变（零列类型迁移）
- 此前 DB 存的是服务器本地时间（部署 TZ = Asia/Singapore，UTC+8，
  无夏令时），本迁移对本地时间列一次性回填 -8 小时
- user 表的 verification_code_* / token_expires_at 历来写 UTC
  （utils/verification.utcnow / auth UTC 写入），【排除】在回填之外；
  user 仅 created_at/updated_at 参与回填
- 幂等性依赖 alembic_version（本迁移只应执行一次）；若环境存在
  迁移史漂移，请先核对再执行

发布顺序约束：迁移先回填 → 新代码随后上线（deploy.sh 的停机窗口内
一次切换，旧进程 down 之后不再写入本地时间）。

注意：列清单为硬编码字面量（无外部输入），整段 SQL 直接内联在
op.execute 中以通过安全扫描（禁止 f-string/格式化/变量拼 SQL）。

Revision ID: 20260907_000400
Revises: 20260907_000300
Create Date: 2026-09-07
"""

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260907_000400"
down_revision: str | None = "20260907_000300"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """DO $$
BEGIN
UPDATE agentrun SET created_at = created_at - interval '8 hours' WHERE created_at IS NOT NULL;
UPDATE agentrun SET started_at = started_at - interval '8 hours' WHERE started_at IS NOT NULL;
UPDATE agentrun SET updated_at = updated_at - interval '8 hours' WHERE updated_at IS NOT NULL;
UPDATE agentrun SET deadline_at = deadline_at - interval '8 hours' WHERE deadline_at IS NOT NULL;
UPDATE agentrun SET last_heartbeat_at = last_heartbeat_at - interval '8 hours' WHERE last_heartbeat_at IS NOT NULL;
UPDATE agentrun SET completed_at = completed_at - interval '8 hours' WHERE completed_at IS NOT NULL;
UPDATE agentrun SET cancelled_at = cancelled_at - interval '8 hours' WHERE cancelled_at IS NOT NULL;
UPDATE agentrun SET timed_out_at = timed_out_at - interval '8 hours' WHERE timed_out_at IS NOT NULL;
UPDATE executionplan SET created_at = created_at - interval '8 hours' WHERE created_at IS NOT NULL;
UPDATE executionplan SET updated_at = updated_at - interval '8 hours' WHERE updated_at IS NOT NULL;
UPDATE executionplan SET completed_at = completed_at - interval '8 hours' WHERE completed_at IS NOT NULL;
UPDATE message SET timestamp = timestamp - interval '8 hours' WHERE timestamp IS NOT NULL;
UPDATE runevent SET timestamp = timestamp - interval '8 hours' WHERE timestamp IS NOT NULL;
UPDATE share_token SET created_at = created_at - interval '8 hours' WHERE created_at IS NOT NULL;
UPDATE share_token SET revoked_at = revoked_at - interval '8 hours' WHERE revoked_at IS NOT NULL;
UPDATE customagent SET created_at = created_at - interval '8 hours' WHERE created_at IS NOT NULL;
UPDATE customagent SET updated_at = updated_at - interval '8 hours' WHERE updated_at IS NOT NULL;
UPDATE artifact SET created_at = created_at - interval '8 hours' WHERE created_at IS NOT NULL;
UPDATE systemexpert SET created_at = created_at - interval '8 hours' WHERE created_at IS NOT NULL;
UPDATE systemexpert SET updated_at = updated_at - interval '8 hours' WHERE updated_at IS NOT NULL;
UPDATE thread SET created_at = created_at - interval '8 hours' WHERE created_at IS NOT NULL;
UPDATE thread SET updated_at = updated_at - interval '8 hours' WHERE updated_at IS NOT NULL;
UPDATE toolpolicy SET created_at = created_at - interval '8 hours' WHERE created_at IS NOT NULL;
UPDATE toolpolicy SET updated_at = updated_at - interval '8 hours' WHERE updated_at IS NOT NULL;
UPDATE skilltemplate SET created_at = created_at - interval '8 hours' WHERE created_at IS NOT NULL;
UPDATE skilltemplate SET updated_at = updated_at - interval '8 hours' WHERE updated_at IS NOT NULL;
UPDATE subtask SET created_at = created_at - interval '8 hours' WHERE created_at IS NOT NULL;
UPDATE subtask SET updated_at = updated_at - interval '8 hours' WHERE updated_at IS NOT NULL;
UPDATE subtask SET started_at = started_at - interval '8 hours' WHERE started_at IS NOT NULL;
UPDATE subtask SET completed_at = completed_at - interval '8 hours' WHERE completed_at IS NOT NULL;
UPDATE "user" SET created_at = created_at - interval '8 hours' WHERE created_at IS NOT NULL;
UPDATE "user" SET updated_at = updated_at - interval '8 hours' WHERE updated_at IS NOT NULL;
UPDATE user_settings SET updated_at = updated_at - interval '8 hours' WHERE updated_at IS NOT NULL;
UPDATE user_memories SET created_at = created_at - interval '8 hours' WHERE created_at IS NOT NULL;
UPDATE mcp_servers SET created_at = created_at - interval '8 hours' WHERE created_at IS NOT NULL;
UPDATE mcp_servers SET updated_at = updated_at - interval '8 hours' WHERE updated_at IS NOT NULL;
END $$;"""
    )


def downgrade() -> None:
    op.execute(
        """DO $$
BEGIN
UPDATE agentrun SET created_at = created_at + interval '8 hours' WHERE created_at IS NOT NULL;
UPDATE agentrun SET started_at = started_at + interval '8 hours' WHERE started_at IS NOT NULL;
UPDATE agentrun SET updated_at = updated_at + interval '8 hours' WHERE updated_at IS NOT NULL;
UPDATE agentrun SET deadline_at = deadline_at + interval '8 hours' WHERE deadline_at IS NOT NULL;
UPDATE agentrun SET last_heartbeat_at = last_heartbeat_at + interval '8 hours' WHERE last_heartbeat_at IS NOT NULL;
UPDATE agentrun SET completed_at = completed_at + interval '8 hours' WHERE completed_at IS NOT NULL;
UPDATE agentrun SET cancelled_at = cancelled_at + interval '8 hours' WHERE cancelled_at IS NOT NULL;
UPDATE agentrun SET timed_out_at = timed_out_at + interval '8 hours' WHERE timed_out_at IS NOT NULL;
UPDATE executionplan SET created_at = created_at + interval '8 hours' WHERE created_at IS NOT NULL;
UPDATE executionplan SET updated_at = updated_at + interval '8 hours' WHERE updated_at IS NOT NULL;
UPDATE executionplan SET completed_at = completed_at + interval '8 hours' WHERE completed_at IS NOT NULL;
UPDATE message SET timestamp = timestamp + interval '8 hours' WHERE timestamp IS NOT NULL;
UPDATE runevent SET timestamp = timestamp + interval '8 hours' WHERE timestamp IS NOT NULL;
UPDATE share_token SET created_at = created_at + interval '8 hours' WHERE created_at IS NOT NULL;
UPDATE share_token SET revoked_at = revoked_at + interval '8 hours' WHERE revoked_at IS NOT NULL;
UPDATE customagent SET created_at = created_at + interval '8 hours' WHERE created_at IS NOT NULL;
UPDATE customagent SET updated_at = updated_at + interval '8 hours' WHERE updated_at IS NOT NULL;
UPDATE artifact SET created_at = created_at + interval '8 hours' WHERE created_at IS NOT NULL;
UPDATE systemexpert SET created_at = created_at + interval '8 hours' WHERE created_at IS NOT NULL;
UPDATE systemexpert SET updated_at = updated_at + interval '8 hours' WHERE updated_at IS NOT NULL;
UPDATE thread SET created_at = created_at + interval '8 hours' WHERE created_at IS NOT NULL;
UPDATE thread SET updated_at = updated_at + interval '8 hours' WHERE updated_at IS NOT NULL;
UPDATE toolpolicy SET created_at = created_at + interval '8 hours' WHERE created_at IS NOT NULL;
UPDATE toolpolicy SET updated_at = updated_at + interval '8 hours' WHERE updated_at IS NOT NULL;
UPDATE skilltemplate SET created_at = created_at + interval '8 hours' WHERE created_at IS NOT NULL;
UPDATE skilltemplate SET updated_at = updated_at + interval '8 hours' WHERE updated_at IS NOT NULL;
UPDATE subtask SET created_at = created_at + interval '8 hours' WHERE created_at IS NOT NULL;
UPDATE subtask SET updated_at = updated_at + interval '8 hours' WHERE updated_at IS NOT NULL;
UPDATE subtask SET started_at = started_at + interval '8 hours' WHERE started_at IS NOT NULL;
UPDATE subtask SET completed_at = completed_at + interval '8 hours' WHERE completed_at IS NOT NULL;
UPDATE "user" SET created_at = created_at + interval '8 hours' WHERE created_at IS NOT NULL;
UPDATE "user" SET updated_at = updated_at + interval '8 hours' WHERE updated_at IS NOT NULL;
UPDATE user_settings SET updated_at = updated_at + interval '8 hours' WHERE updated_at IS NOT NULL;
UPDATE user_memories SET created_at = created_at + interval '8 hours' WHERE created_at IS NOT NULL;
UPDATE mcp_servers SET created_at = created_at + interval '8 hours' WHERE created_at IS NOT NULL;
UPDATE mcp_servers SET updated_at = updated_at + interval '8 hours' WHERE updated_at IS NOT NULL;
END $$;"""
    )
