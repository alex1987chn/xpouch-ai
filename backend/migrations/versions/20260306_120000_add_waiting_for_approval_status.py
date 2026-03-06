"""Add waiting_for_approval status to task_status_enum for HITL support.

Revision ID: 20260306_120000
Revises: 20260304_180000
Create Date: 2026-03-06 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260306_120000"
down_revision: str | None = "006"  # 修复：指向最新的 head
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """
    添加 waiting_for_approval 状态到 task_status_enum。

    用于 HITL (Human-in-the-Loop) 场景：
    - Commander 生成计划后，状态变为 waiting_for_approval
    - 用户审核批准后，状态变为 running
    - 用户拒绝后，状态变为 cancelled

    注意：PostgreSQL ENUM 添加新值需要使用 ALTER TYPE ... ADD VALUE，
    且新值不能放在已有值之前（否则会导致排序问题）。
    """
    bind = op.get_bind()

    # 检查枚举值是否已存在
    result = bind.execute(
        sa.text(
            "SELECT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'waiting_for_approval' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'task_status_enum'))"
        )
    )
    exists = result.scalar()

    if not exists:
        # 添加新枚举值（放在 pending 之后）
        # PostgreSQL 要求新值不能放在已有值之前，所以直接追加
        bind.execute(
            sa.text("ALTER TYPE task_status_enum ADD VALUE IF NOT EXISTS 'waiting_for_approval'")
        )


def downgrade() -> None:
    """
    回滚：PostgreSQL 不支持直接删除 ENUM 值。

    解决方案：
    1. 创建新的 ENUM 类型（不包含 waiting_for_approval）
    2. 迁移数据（将 waiting_for_approval 转换为 pending）
    3. 删除旧 ENUM，重命名新 ENUM

    由于回滚风险较高，这里采用空实现，保留枚举值。
    如需完全回滚，请手动执行以下 SQL：

    ```sql
    -- 将 waiting_for_approval 状态重置为 pending
    UPDATE tasksession SET status = 'pending' WHERE status = 'waiting_for_approval';
    UPDATE subtask SET status = 'pending' WHERE status = 'waiting_for_approval';

    -- 注意：PostgreSQL ENUM 值无法直接删除
    -- 如需完全删除，需要重建 ENUM 类型（风险较高）
    ```
    """
    # 安全回滚：将 waiting_for_approval 状态重置为 pending
    bind = op.get_bind()

    # 检查是否有 waiting_for_approval 状态的数据
    result = bind.execute(
        sa.text("SELECT COUNT(*) FROM tasksession WHERE status = 'waiting_for_approval'")
    )
    count = result.scalar()

    if count and count > 0:
        bind.execute(
            sa.text(
                "UPDATE tasksession SET status = 'pending' WHERE status = 'waiting_for_approval'"
            )
        )

    result = bind.execute(
        sa.text("SELECT COUNT(*) FROM subtask WHERE status = 'waiting_for_approval'")
    )
    count = result.scalar()

    if count and count > 0:
        bind.execute(
            sa.text("UPDATE subtask SET status = 'pending' WHERE status = 'waiting_for_approval'")
        )

    # 注意：PostgreSQL ENUM 值无法直接删除
    # 保留 'waiting_for_approval' 枚举值，仅清理数据
