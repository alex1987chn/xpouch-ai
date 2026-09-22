"""
时间统一工具（UTC aware，2026-09-22 aware 化专项）

约定（v3.5.5 起，行业常规的全链路 aware UTC）：
- 所有 DB 时间列统一写 aware UTC：utc_now()
- 列类型 timestamptz（模型层经 SQLModel.type_annotation_map 全局映射
  DateTime(timezone=True)），psycopg 读取自动带 tzinfo
- API 序列化自动带 +00:00 后缀，前端 parseISO/new Date 直接解析
- 例外：注入 prompt / 时间工具等"用户侧时钟"仍用本地墙钟
  （utils/prompt_utils、tools/utils），它们表达的是用户墙钟而非数据库时间

历史：v3.4.4~v3.5.4 曾采用全库 UTC naive（utc_now + timestamp 列 +
前端补 Z 解析），2026-09-22 迁移至 aware——迁移 20260922_000100 将列转为
timestamptz（USING AT TIME ZONE 'UTC' 零损失），前端补 Z 逻辑同步移除。
sqlmodel 0.0.45 对 naive datetime 的强校验是本次迁移的触发信号之一。
"""

from datetime import UTC, datetime


def utc_now() -> datetime:
    """当前 UTC 时间（aware，与 timestamptz 列直接对应）。"""
    return datetime.now(UTC)
