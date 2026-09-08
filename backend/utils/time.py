"""
时间统一工具（UTC 化，P7）

背景：此前 DB 写入混用两种时间——auth 域写 naive UTC（utils/verification、
token 过期），其余模块写服务器本地时间（datetime.now()）。deadline 比较、
cleanup 判断、跨表排序都依赖"同一时钟"。

约定（v3.4.4 起）：
- 所有 DB 时间列统一写 naive UTC：utc_now_naive()
- 列类型保持 naive DateTime 不变（零列类型迁移）
- 存量本地时间数据由迁移 20260907_000400 一次性回填 -8h
  （部署 TZ = Asia/Singapore，UTC+8 无夏令时）
- 例外：注入 prompt / 时间工具等"用户侧时钟"仍用本地时间
  （utils/prompt_utils、tools/utils），它们表达的是用户墙钟而非数据库时间
"""

from datetime import UTC, datetime


def utc_now_naive() -> datetime:
    """当前 UTC 时间（naive，与 DB 的 naive DateTime 列直接对应）。"""
    return datetime.now(UTC).replace(tzinfo=None)
