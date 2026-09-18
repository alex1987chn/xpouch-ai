"""
统计 API 响应模型

用于运行统计和趋势数据返回。
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from models.enums import RunStatus


class RunMetrics(BaseModel):
    """运行核心指标"""

    total_runs: int  # 总运行数
    success_count: int  # 成功数
    failed_count: int  # 失败数
    hitl_count: int  # HITL 拦截次数
    avg_duration_ms: float  # 平均耗时（毫秒）
    success_rate: float  # 成功率（百分比）


class DailyTrend(BaseModel):
    """每日趋势数据"""

    date: str  # 日期 YYYY-MM-DD
    total_count: int  # 当天总运行数
    success_count: int  # 当天成功数
    failed_count: int  # 当天失败数


class RunListItem(BaseModel):
    """运行列表项

    按「恒序列化、值可空的字段不写默认值」约定，user_id/user_name 无默认值——
    crud 组装的 dict 恒带全部键，默认值只会让 OpenAPI 契约退化成 optional。
    """

    run_id: str
    thread_id: str
    user_id: str | None  # 仅 admin 可见
    user_name: str | None  # 仅 admin 可见
    mode: Literal["simple", "complex"]
    status: RunStatus
    duration_ms: int | None
    created_at: datetime
    completed_at: datetime | None


class RunStatsResponse(BaseModel):
    """运行统计响应"""

    # 权限标识
    is_admin: bool

    # 今日 token 用量与每用户日配额（quota 为 null 表示不限量）
    today_tokens: int
    daily_token_quota: int | None

    # 核心指标
    metrics: RunMetrics

    # 趋势数据（按天统计，最近 7 天）
    trends: list[DailyTrend]

    # 运行列表（分页）
    runs: list[RunListItem]

    # 分页信息
    total_runs_count: int  # 总记录数（用于分页）
    limit: int
    offset: int


class TokensTodayResponse(BaseModel):
    """今日 token 用量 + 全局配额（底栏轻量轮询专供）。

    约定：响应模型里「恒序列化、值可空」的字段不写默认值——写了默认值会被
    OpenAPI 降级成 optional，而 FastAPI 运行时其实恒有键（null 也是键）；
    无默认值才能生成 `required + nullable` 的准确契约。
    """

    today_tokens: int
    daily_token_quota: int | None
