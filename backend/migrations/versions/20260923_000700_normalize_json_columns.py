"""schema 漂移归一：message.extra_data / runevent.event_data 列 text → json

背景（2026-09-23 生产部署实抓）：这两列在早期 create_all 时代被建成 text
（当时模型注解即 Text），代码后来改注 JSON 但 alembic 从未对已有列做类型
转换——本地开发库是 json、生产是 text。000500 的 `->>` JSON 操作符在
text 列上不存在（operator does not exist: text ->> unknown），部署即炸。

治本=把漂移列归一为与模型注解一致的 json：
- 先清洗不可转换的行（空串/非 JSON 文本置 NULL——NULL 语义与模型
  `dict | None` 一致，运行时按空处理）
- 再 ALTER ... USING NULLIF(extra_data,'')::json

两列均条件执行（已是 json 的库跳过）；坏行只可能是历史脏数据——
模型契约从来只写 JSON 对象或 NULL。

回滚：不回滚类型（回 text 会重新炸 JSON 操作符）。
"""

from collections.abc import Sequence

from alembic import op
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision: str = "20260923_000700"
down_revision: str | None = "20260923_000600"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# (表, 列)——均为模型注解 JSON 的漂移嫌疑列（账本列一并归一，时间线
# 统计 API 的 JSON 查询在生产 text 列上同样会炸）
_TARGETS = (
    ("message", "extra_data"),
    ("runevent", "event_data"),
)


def upgrade() -> None:
    conn = op.get_bind()
    for table, column in _TARGETS:
        col = conn.execute(
            text(
                "SELECT data_type FROM information_schema.columns "
                "WHERE table_name = :t AND column_name = :c"
            ),
            {"t": table, "c": column},
        ).fetchone()
        if col is None:
            print(f"[migration 000700] {table}.{column} 不存在，跳过")
            continue
        if col[0] == "json":
            print(f"[migration 000700] {table}.{column} 已是 json，跳过")
            continue
        # 非对象/空串行置 NULL（USING 转换对它们必炸；NULL 与模型 Optional 语义一致）
        conn.execute(
            text(
                f"UPDATE {table} SET {column} = NULL "
                f"WHERE {column} IS NULL OR btrim({column}) = '' "
                f"OR btrim({column}) NOT LIKE '{{%'"
            )
        )
        conn.execute(
            text(
                f"ALTER TABLE {table} ALTER COLUMN {column} TYPE json "
                f"USING NULLIF({column}, '')::json"
            )
        )
        print(f"[migration 000700] {table}.{column}: {col[0]} -> json")


def downgrade() -> None:
    # 类型归一不回滚（回 text 会重新炸 JSON 操作符）
    pass
