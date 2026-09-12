"""
联网搜索工具 - 基于 Tavily Search
Tavily 是专为 AI Agent 设计的搜索引擎，返回整理好的文本片段，非常适合 RAG

同步/异步共用官方 langchain-tavily 的 TavilySearch（其 ainvoke 走
tavily-python 异步客户端，不阻塞事件循环）——不再手写 httpx 调 REST。
"""

from langchain_core.tools import tool
from langchain_tavily import TavilySearch as TavilySearchResults

from config import settings
from utils.logger import logger

# -----------------------------------------------------------


def _build_tavily_tool() -> TavilySearchResults | None:
    """未配置 Key 时返回 None（调用方降级为提示文案）。"""
    if not settings.tavily_api_key:
        return None
    # max_results=3 节省 Token
    # include_answer=True 让 Tavily 直接生成一段总结，效果更好
    return TavilySearchResults(max_results=3, include_answer=True)


@tool
def search_web(query: str) -> str:
    """
    通用联网搜索工具。

    【重要路由指令】：
    当用户询问通用实时信息（如泛新闻、股价、冷知识、全网事件）时使用此工具。

    ⚠️ 降级警告 (Fallback Only)：
    如果用户的请求涉及**特定领域的专业查询**（例如：具体的地图路线规划、精确的本地天气预报、特定代码仓库读取等），且你的工具列表中存在对应的【专业工具】（如高德地图等 MCP 工具），请**绝对优先调用专业工具**。
    只有当专业工具查不到结果，或用户明确要求大范围全网搜索时，才将本工具作为兜底方案。

    Args:
        query: 搜索查询内容

    Returns:
        搜索结果文本
    """
    tavily_tool = _build_tavily_tool()
    if tavily_tool is None:
        return "❌ 错误: 后端未配置 TAVILY_API_KEY，无法搜索。请联系管理员配置 TAVILY_API_KEY 环境变量。"

    try:
        logger.info(f"--- [Tool] 正在搜索: {query} ---")
        results = tavily_tool.invoke({"query": query})

        # 调试日志：看看搜到了啥
        logger.debug(f"[Debug] 搜索原始结果类型: {type(results)}")

        return f"【搜索结果】:\n{results}"

    except Exception as e:
        # 捕获运行时错误（比如 Key 填错了，或者断网了）
        error_msg = f"❌ 搜索工具执行失败: {str(e)}"
        logger.error(error_msg)
        return error_msg


@tool
async def asearch_web(query: str) -> str:
    """
    异步联网搜索工具。

    与 search_web 功能完全相同，但通过官方客户端的 ainvoke 异步执行，
    不阻塞事件循环，支持并发。

    【重要路由指令】：
    当用户询问通用实时信息（如泛新闻、股价、冷知识、全网事件）时使用此工具。

    ⚠️ 降级警告 (Fallback Only)：
    如果用户的请求涉及**特定领域的专业查询**，请优先调用专业 MCP 工具。

    Args:
        query: 搜索查询内容

    Returns:
        搜索结果文本
    """
    tavily_tool = _build_tavily_tool()
    if tavily_tool is None:
        return "❌ 错误: 后端未配置 TAVILY_API_KEY，无法搜索。请联系管理员配置 TAVILY_API_KEY 环境变量。"

    try:
        logger.info(f"--- [Tool] 正在异步搜索: {query} ---")
        results = await tavily_tool.ainvoke({"query": query})

        logger.debug(f"[Debug] 异步搜索完成，结果类型: {type(results)}")
        return f"【搜索结果】:\n{results}"

    except Exception as e:
        error_msg = f"❌ 异步搜索工具执行失败: {str(e)}"
        logger.error(error_msg)
        return error_msg
