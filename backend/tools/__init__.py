"""
XPouch AI 工具集
提供联网搜索、时间查询、数学计算等基础工具，增强 Agent 能力
"""

from .search import search_web
from .utils import get_current_time, calculator
from .browser import read_webpage  # 👈 新增这一行

# 定义工具全家桶列表，用于 LangGraph 集成
ALL_TOOLS = [
    search_web,
    get_current_time,
    calculator,
    read_webpage   # 👈 别忘了加到列表里！
]

__all__ = [
    "search_web",
    "get_current_time",
    "calculator",
    "read_webpage", # 👈 导出
    "ALL_TOOLS"
]
