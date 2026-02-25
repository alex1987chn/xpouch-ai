"""
XPouch AI 工具集
提供联网搜索、时间查询、数学计算等基础工具，增强 Agent 能力

P1 优化: 添加异步工具版本
"""

# 同步工具
from .search import search_web, asearch_web
from .utils import get_current_time, calculator
from .browser import read_webpage, aread_webpage

# 定义同步工具全家桶列表，用于 LangGraph 集成
BASE_TOOLS = [
    search_web,
    get_current_time,
    calculator,
    read_webpage
]

# P1 优化: 定义异步工具列表
ASYNC_TOOLS = [
    asearch_web,
    get_current_time,  # 纯计算，无需异步版本
    calculator,        # 纯计算，无需异步版本
    aread_webpage
]

# 保持向后兼容
ALL_TOOLS = BASE_TOOLS

__all__ = [
    # 同步工具
    "search_web",
    "get_current_time",
    "calculator",
    "read_webpage",
    # 异步工具 (P1)
    "asearch_web",
    "aread_webpage",
    # 工具列表
    "BASE_TOOLS",
    "ASYNC_TOOLS",
    "ALL_TOOLS"
]
