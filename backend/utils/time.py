"""
时间统一工具（UTC aware，2026-09-22 aware 化专项）

约定（v3.5.5 起，行业常规的全链路 aware UTC）：
- 所有 DB 时间列统一写 aware UTC：utc_now()
- 列类型 timestamptz（模型层经 SQLModel.type_annotation_map 全局映射
  DateTime(timezone=True)），psycopg 读取自动带 tzinfo
- API 序列化自动带 +00:00 后缀，前端 parseISO/new Date 直接解析
- 例外：注入 prompt / 时间工具等"用户墙钟"走 display_now()（转换到
  DISPLAY_TIMEZONE 配置时区，见 utils/prompt_utils、tools/utils）——
  此前用 datetime.now() 拿的是服务器墙钟，生产容器（UTC）下给模型的
  时间与用户真实墙钟差数小时

历史：v3.4.4~v3.5.4 曾采用全库 UTC naive（utc_now + timestamp 列 +
前端补 Z 解析），2026-09-22 迁移至 aware——迁移 20260922_000100 将列转为
timestamptz（USING AT TIME ZONE 'UTC' 零损失），前端补 Z 逻辑同步移除。
sqlmodel 0.0.45 对 naive datetime 的强校验是本次迁移的触发信号之一。
"""

from datetime import UTC, datetime
from zoneinfo import ZoneInfo


def utc_now() -> datetime:
    """当前 UTC 时间（aware，与 timestamptz 列直接对应）。"""
    return datetime.now(UTC)


def display_now() -> datetime:
    """用户墙钟当前时间（aware，转换到 settings.display_timezone）。

    只用于面向人/LLM 的展示（prompt 时间注入、get_current_time 工具）；
    存储与 API 时间一律 utc_now()。服务器（尤其容器）系统时区通常是 UTC，
    直接 datetime.now() 会把服务器墙钟当用户墙钟。
    """
    from config import settings

    return utc_now().astimezone(ZoneInfo(settings.display_timezone))


_WEEKDAYS = ("星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日")


def format_display_datetime(dt: datetime | None = None) -> str:
    """用户墙钟的统一展示格式：2026年09月23日 13:05:00 星期二。"""
    now = dt or display_now()
    return now.strftime(f"%Y年%m月%d日 %H:%M:%S {_WEEKDAYS[now.weekday()]}")
