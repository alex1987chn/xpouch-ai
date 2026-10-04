"""toolpolicy 表加 deferred 列（延迟工具层，迁移即数据开关）

Revision ID: 20261003_000908
Revises: 20261003_000907
Create Date: 2026-10-03

2026-10-03 架构审视第二项：MCP 工具全量进上下文（schema + 描述织入
prompt）随工具数量线性恶化。引入延迟层（client-side Tool Search，协议
见 agents/deferred_tools.py 模块注释）——本迁移只加数据开关列：

- deferred 默认 false：未配置时绑定行为与引入前完全一致（零风险上线）
- 管理台按工具打开 defer（仅 MCP 工具生效，resolve 侧强制）
- 无种子数据：defer 是运维偏好不是内置事实，不随迁移下发

守卫式字面量 SQL：先查 information_schema 判存在再 ALTER，幂等重跑不炸。
"""

from collections.abc import Sequence

from alembic import op
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision: str = "20261003_000908"
down_revision: str | None = "20261003_000907"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()
    exists = conn.execute(
        text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name = 'toolpolicy' AND column_name = 'deferred'"
        )
    ).fetchone()
    if not exists:
        conn.execute(
            text("ALTER TABLE toolpolicy ADD COLUMN deferred boolean NOT NULL DEFAULT false")
        )
        print("[migration 000908] toolpolicy.deferred 已添加（默认 false，行为不变）")
    else:
        print("[migration 000908] toolpolicy.deferred 已存在，跳过")


def downgrade() -> None:
    # 回滚删列会丢运维配置；保守起见保留列（布尔默认 false 即等价禁用）
    pass
