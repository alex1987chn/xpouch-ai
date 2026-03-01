"""
联网搜索工具 - 基于 Tavily Search
Tavily 是专为 AI Agent 设计的搜索引擎，返回整理好的文本片段，非常适合 RAG

P1 优化: 添加异步支持
"""
import os
from langchain_core.tools import tool
from utils.logger import logger

# -----------------------------------------------------------
# 核心修复：兼容性导入逻辑
# -----------------------------------------------------------
try:
    # 优先尝试新版（官方推荐）
    from langchain_tavily import TavilySearchResults
    logger.info("[Search] [OK] 使用 langchain_tavily (新版)")
except ImportError:
    try:
        # 回退到旧版（社区版）
        from langchain_community.tools.tavily_search import TavilySearchResults
        logger.warning("[Search] [WARN] 使用 langchain_community.tools.tavily_search (旧版)")
    except ImportError:
        # 如果都没装，直接抛出异常，不要吞掉！
        raise ImportError(
            "[ERROR] 严重错误: 未找到 Tavily 库。请运行: uv add langchain-tavily langchain-community"
        )

# P1 优化: 导入异步 HTTP 客户端
import httpx
from langchain_core.tools import ToolException

# -----------------------------------------------------------

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
    api_key = os.getenv("TAVILY_API_KEY")
    if not api_key:
        return "❌ 错误: 后端未配置 TAVILY_API_KEY，无法搜索。请联系管理员配置 TAVILY_API_KEY 环境变量。"

    try:
        # max_results=3 节省 Token
        # include_answer=True 让 Tavily 直接生成一段总结，效果更好
        tavily_tool = TavilySearchResults(max_results=3, include_answer=True)

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


# P1 优化: 添加异步版本
@tool
async def asearch_web(query: str) -> str:
    """
    异步联网搜索工具。

    P1 优化:
    - 使用异步 HTTP 请求，不阻塞事件循环
    - 与 search_web 功能完全相同，但支持并发执行

    【重要路由指令】：
    当用户询问通用实时信息（如泛新闻、股价、冷知识、全网事件）时使用此工具。
    
    ⚠️ 降级警告 (Fallback Only)：
    如果用户的请求涉及**特定领域的专业查询**，请优先调用专业 MCP 工具。

    Args:
        query: 搜索查询内容

    Returns:
        搜索结果文本
    """
    api_key = os.getenv("TAVILY_API_KEY")
    if not api_key:
        return "❌ 错误: 后端未配置 TAVILY_API_KEY，无法搜索。请联系管理员配置 TAVILY_API_KEY 环境变量。"

    try:
        # P1 优化: 使用异步 HTTP 客户端直接调用 Tavily API
        # 而不是使用 LangChain 的同步工具
        async with httpx.AsyncClient(timeout=30.0) as client:
            logger.info(f"--- [Tool] 正在异步搜索: {query} ---")
            
            response = await client.post(
                "https://api.tavily.com/search",
                headers={"Content-Type": "application/json"},
                json={
                    "api_key": api_key,
                    "query": query,
                    "max_results": 3,
                    "include_answer": True
                }
            )
            response.raise_for_status()
            data = response.json()
            
            # 格式化结果
            results = []
            
            # 添加总结（如果有）
            if data.get("answer"):
                results.append(f"【回答】: {data['answer']}")
            
            # 添加搜索结果
            if data.get("results"):
                results.append("【搜索结果】:")
                for i, result in enumerate(data["results"][:3], 1):
                    results.append(f"{i}. {result.get('title', '无标题')}")
                    results.append(f"   {result.get('content', '无内容')[:200]}...")
                    results.append(f"   来源: {result.get('url', '未知')}")
            
            output = "\n".join(results) if results else "未找到搜索结果"
            logger.debug(f"[Debug] 异步搜索完成，结果长度: {len(output)}")
            return output

    except httpx.TimeoutException:
        error_msg = "❌ 搜索超时 (30秒)"
        logger.error(error_msg)
        return error_msg
    except Exception as e:
        error_msg = f"❌ 异步搜索工具执行失败: {str(e)}"
        logger.error(error_msg)
        return error_msg
