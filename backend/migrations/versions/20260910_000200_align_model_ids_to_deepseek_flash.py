"""数据对齐：存量专家/智能体模型 ID 刷新为 deepseek-flash

DeepSeek 于 2026-09-10 发布 V4.1-Flash，上游模型名由 deepseek-v4-flash
更名为 deepseek-flash（旧 ID 官方已下线，临时路由兼容、随时可能停止）。
providers.yaml 已保留 hidden 别名兜底（解析层不受影响），本迁移把存量行
刷新对齐到新 ID，保持管理界面展示一致。

幂等：WHERE 精确匹配旧 ID，重复执行无效果。
覆盖范围：systemexpert.model 与 customagent.model_id（两处存储模型 ID 的列）。

注意：列清单与目标值为硬编码字面量（无外部输入），直接内联在 op.execute
中以通过安全扫描（禁止 f-string/格式化/变量拼 SQL）。

Revision ID: 20260910_000200
Revises: 20260910_000100
Create Date: 2026-09-10
"""

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260910_000200"
down_revision: str | None = "20260910_000100"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """DO $$
BEGIN
UPDATE systemexpert SET model = 'deepseek-flash' WHERE model IN ('deepseek-v4-flash', 'deepseek-chat', 'deepseek-reasoner');
UPDATE customagent SET model_id = 'deepseek-flash' WHERE model_id IN ('deepseek-v4-flash', 'deepseek-chat', 'deepseek-reasoner');
END $$;"""
    )


def downgrade() -> None:
    # 不回写旧 ID：旧模型名已被上游停用，回滚只会重新制造隐患
    pass
