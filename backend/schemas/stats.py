"""
统计 API 响应模型

用于运行统计和趋势数据返回。
"""

from datetime import datetime

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
    """运行列表项"""

    run_id: str
    thread_id: str
    user_id: str | None = None  # 仅 admin 可见
    user_name: str | None = None  # 仅 admin 可见
    mode: str  # simple/complex
    status: RunStatus
    duration_ms: int | None
    created_at: datetime
    completed_at: datetime | None


class RunStatsResponse(BaseModel):
    """运行统计响应"""

    # 权限标识
    is_admin: bool

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
