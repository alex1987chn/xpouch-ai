"""清理 create_all 时代的死表（评审遗留项）

Revision ID: 20260916_000100
Revises: 20260914_000200
Create Date: 2026-09-16

两张「库里有、迁移链不产、模型没有」的死表，只存在于 create_all 时代的
老库（开发/生产）；全新部署从不创建它们。它们会在老库上跑 `alembic check`
时报 remove_table 噪音，让人误判 schema 烂了——这正是本迁移要消除的误导：

- ``tasksession``：2026-03-07 表改名（tasksession → executionplan）前的
  残留快照，改名后即被弃用，全仓零代码引用。开发库已确认为空表；
  生产库若残留旧数据，随本迁移清除（deploy.sh 迁移前有备份挂钩可回溯）。
- ``migration_history``：来源不明的古老工具表（与 Alembic 的
  alembic_version 无关），零代码引用。

``DROP TABLE IF EXISTS`` 自带守卫：空库链上不产生过这两张表，重放为 no-op。
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260916_000100"
down_revision: str | None = "20260914_000200"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("DROP TABLE IF EXISTS tasksession")
    op.execute("DROP TABLE IF EXISTS migration_history")


def downgrade() -> None:
    # 死表不恢复：它们不属于任何现行模型，恢复只会重新制造漂移。
    pass
