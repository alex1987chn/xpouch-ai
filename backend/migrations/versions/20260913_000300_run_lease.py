"""run 租约：`owner` / `lease_expires_at` / `attempt`（批次 D / 决定 2）

把「run 还活着吗」从四处启发式收敛成一个机制：一个 run 由**某个进程**持有，
持有期限写在 `lease_expires_at`；进程活着就由 supervisor 定期续租，进程死了租约
自然过期，由（任意进程的）回收逻辑标记为超时。

三列分工：
- `owner`：持有者身份（进程级，见 utils/run_lease.py 的 RUN_OWNER_ID）。用于
  「同一 run 不得被两个进程同时驱动」与排查。
- `lease_expires_at`：租约到期时刻。**存活判定的唯一权威**（旧口径是
  `updated_at` 30 分钟没动就猜它死了）。
- `attempt`：该 run 被驱动过几次（1 = 首轮，2 = 审批后续跑…）。用于排查与
  重复投递的对账。

`last_heartbeat_at` 保留不动：它记的是「最后一次见到进展」，是诊断信息；
存活判定不再看它（两者语义不同，别混）。

存量数据处理：**不回填 owner/lease**。迁移前处于活跃状态的 run 一律视为
「无租约 = 无存活证据」，由 supervisor 在下一个周期回收成 timed_out
（部署必然伴随进程重启，这些行本就是僵尸）。这是有意为之——回填一个假租约
会让僵尸再多活一个租期。

Revision ID: 20260913_000300
Revises: 20260913_000200
Create Date: 2026-09-13
"""

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260913_000300"
down_revision: str | None = "20260913_000200"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE agentrun ADD COLUMN IF NOT EXISTS owner VARCHAR(128)")
    op.execute("ALTER TABLE agentrun ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMP")
    op.execute("ALTER TABLE agentrun ADD COLUMN IF NOT EXISTS attempt INTEGER NOT NULL DEFAULT 0")
    # 回收查询是 `status 活跃 AND lease_expires_at < now`，走这个索引
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_agentrun_lease_expires_at ON agentrun (lease_expires_at)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_agentrun_lease_expires_at")
    op.execute("ALTER TABLE agentrun DROP COLUMN IF EXISTS attempt")
    op.execute("ALTER TABLE agentrun DROP COLUMN IF EXISTS lease_expires_at")
    op.execute("ALTER TABLE agentrun DROP COLUMN IF EXISTS owner")
