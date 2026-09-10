"""角色收敛：view_admin/edit_admin 归一为 user/admin（v3.4.7 双角色模型）

产品角色从四层（user/view_admin/edit_admin/admin）收敛为两层：
- view_admin → user：可见但锁设计下，普通用户本就能看到全部入口的
  锁定态，只读管理层是伪需求
- edit_admin → admin：实例级管理统一一个角色，消除"改得了专家改不了
  MCP"的分层困惑
- admin 不变；user 不变

幂等：WHERE 精确匹配旧值，重复执行无效果。不提供反向回滚
（无法从 admin 区分原 edit_admin/admin，回写只会制造隐患）。
user.role 列为 varchar（历史迁移确认），直接字符串更新。

注意：值清单为硬编码字面量（无外部输入），直接内联在 op.execute 中
以通过安全扫描（禁止 f-string/格式化/变量拼 SQL）。

Revision ID: 20260910_000300
Revises: 20260910_000200
Create Date: 2026-09-10
"""

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260910_000300"
down_revision: str | None = "20260910_000200"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """DO $$
BEGIN
UPDATE "user" SET role = 'user' WHERE role = 'view_admin';
UPDATE "user" SET role = 'admin' WHERE role = 'edit_admin';
END $$;"""
    )


def downgrade() -> None:
    # 不回滚：收敛不可逆（admin 无法区分原 edit_admin/admin），且旧角色已废弃
    pass
