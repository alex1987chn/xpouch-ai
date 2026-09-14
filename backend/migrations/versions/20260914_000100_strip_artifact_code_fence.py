"""清洗历史 artifact：剥掉包裹整体内容的代码围栏

Revision ID: 20260914_000100
Revises: 20260913_000300
Create Date: 2026-09-14

模型常给产物起名（```html:index.html … ```）。此前专家产物把整个响应原样入库，
围栏头尾被 HTML 预览当正文渲染（页面顶部出现文件名、底部多一行 ```）。
源头已在 agents/nodes/generic.py 入库前剥围栏；本迁移清洗存量行——
只处理「以 ``` 开头、以独立 ``` 行收尾」的 html/code 产物，正文内部代码块不动。
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260914_000100"
down_revision: str | None = "20260913_000300"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 内层 regexp_replace 去掉首行围栏头（```lang[: 文件名] …），
    # 外层去掉结尾独立的 ``` 行；两处都只命中一次（锚定）。
    # 不限产物类型：markdown 等文本产物被围栏整体包裹时同样显示为代码块，一并清洗。
    op.execute(r"""
        UPDATE artifact
        SET content = btrim(
            regexp_replace(
                regexp_replace(content, '^\s*```[^\n]*\n', '', ''),
                '\n```\s*$', '', ''
            )
        )
        WHERE content ~ '^\s*```'
          AND content ~ '\n```\s*$'
    """)


def downgrade() -> None:
    # 数据清洗不可逆（原始围栏无法复原），也无需可逆：重跑源头修复后会保持干净。
    pass
