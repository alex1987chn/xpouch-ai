"""
联网搜索工具 - 基于 Tavily Search
Tavily 是专为 AI Agent 设计的搜索引擎，返回整理好的文本片段，非常适合 RAG
"""
import os
from langchain_core.tools import tool

# -----------------------------------------------------------
# 🔥 核心修复：兼容性导入逻辑
# -----------------------------------------------------------
try:
    # 优先尝试新版（官方推荐）
    from langchain_tavily import TavilySearchResults
    print("[Search] ✅ 使用 langchain_tavily (新版)")
except ImportError:
    try:
        # 回退到旧版（社区版）
        from langchain_community.tools.tavily_search import TavilySearchResults
        print("[Search] ⚠️ 使用 langchain_community.tools.tavily_search (旧版)")
    except ImportError:
        # 如果都没装，直接抛出异常，不要吞掉！
        raise ImportError(
            "❌ 严重错误: 未找到 Tavily 库。请运行: uv add langchain-tavily langchain-community"
        )

# -----------------------------------------------------------

@tool
def search_web(query: str) -> str:
    """
    联网搜索工具。

    当用户询问实时信息（如新闻、股价、天气、冷知识、具体日期发生的事件）时使用此工具。

    Args:
        query: 搜索查询内容

    Returns:
        搜索结果文本
    """
    api_key = os.getenv("TAVILY_API_KEY")
    if not api_key:
        return "❌ 错误: 后端未配置 TAVILY_API_KEY，无法搜索。请联系管理员配置 TAVILY_API_KEY 环境变量。"

    try:
        # max_results=3 节省 Token
        # include_answer=True 让 Tavily 直接生成一段总结，效果更好
        tavily_tool = TavilySearchResults(max_results=3, include_answer=True)

        print(f"--- [Tool] 正在搜索: {query} ---")
        results = tavily_tool.invoke({"query": query})

        # 调试日志：看看搜到了啥
        print(f"[Debug] 搜索原始结果类型: {type(results)}")

        return f"【搜索结果】:\n{results}"

    except Exception as e:
        # 捕获运行时错误（比如 Key 填错了，或者断网了）
        error_msg = f"❌ 搜索工具执行失败: {str(e)}"
        print(error_msg)
        return error_msg
