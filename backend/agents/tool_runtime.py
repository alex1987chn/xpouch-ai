"""
工具节点运行时：超时、重试、错误降级。
供 graph_builder 组装进 StateGraph，与图定义解耦。
"""

import asyncio
import logging
from typing import Any

import httpx
from langchain_core.messages import ToolMessage
from langchain_core.runnables import RunnableConfig
from langgraph.prebuilt import ToolNode

from agents.state import AgentState
from tools import ALL_TOOLS as BASE_TOOLS

logger = logging.getLogger(__name__)

TOOL_TIMEOUT_SECONDS = 60
TOOL_RETRY_DELAYS = [0.8, 1.6]


def _is_transient_connect_error(err: Exception) -> bool:
    """识别可重试的网络连接类错误。"""
    err_str = str(err).lower()
    return (
        isinstance(err, httpx.ConnectError)
        or "connecterror" in err_str
        or "connection reset" in err_str
        or "connection aborted" in err_str
        or "temporarily unavailable" in err_str
        or "network is unreachable" in err_str
    )


def _tool_messages_for_error(state: AgentState, content: str) -> list[ToolMessage]:
    """根据 state 中最后一条 AI 的 tool_calls 生成错误 ToolMessage 列表。"""
    messages = state.get("messages", [])
    tool_messages = []
    for msg in reversed(messages):
        if hasattr(msg, "tool_calls") and msg.tool_calls:
            for tc in msg.tool_calls:
                tool_messages.append(
                    ToolMessage(
                        content=content,
                        tool_call_id=tc.get("id", "unknown"),
                        name=tc.get("name", "unknown"),
                    )
                )
            break
    return tool_messages


async def dynamic_tool_node(
    state: AgentState, config: RunnableConfig | None = None
) -> dict[str, Any]:
    """
    动态工具节点：合并基础工具与 MCP 工具，带超时与重试。

    🔥 日志增强：记录工具调用详情，用于后续分析和优化
    """
    mcp_tools = []
    if config and hasattr(config, "get"):
        mcp_tools = config.get("configurable", {}).get("mcp_tools", [])

    runtime_tools = list(BASE_TOOLS) + list(mcp_tools)
    tool_executor = ToolNode(runtime_tools)
    attempts = len(TOOL_RETRY_DELAYS) + 1

    # 🔥 获取工具调用信息用于日志
    messages = (
        state.get("messages", []) if isinstance(state, dict) else getattr(state, "messages", [])
    )
    tool_calls = []
    for msg in reversed(messages):
        if hasattr(msg, "tool_calls") and msg.tool_calls:
            tool_calls = msg.tool_calls
            break

    # 🔥 记录工具调用请求
    for tc in tool_calls:
        tool_name = tc.get("name", "unknown")
        tool_args = tc.get("args", {})
        logger.info(
            "[ToolNode] 🔧 工具调用请求 | 工具: %s | 参数: %s",
            tool_name,
            str(tool_args)[:200],  # 截断避免日志过长
        )

    for attempt in range(1, attempts + 1):
        try:
            async with asyncio.timeout(TOOL_TIMEOUT_SECONDS):
                result = await tool_executor.ainvoke(state, config)
                # 🔥 记录工具调用成功
                for tc in tool_calls:
                    logger.info("[ToolNode] ✅ 工具调用成功 | 工具: %s", tc.get("name", "unknown"))
                return result
        except TimeoutError:
            logger.error("[ToolNode] 工具调用超时 (%ss)", TOOL_TIMEOUT_SECONDS)
            return {
                "messages": _tool_messages_for_error(
                    state,
                    "工具调用超时 (60秒)。该服务可能暂时不可用或响应过慢，请稍后重试或尝试其他工具。",
                )
            }
        except Exception as err:
            is_last = attempt >= attempts
            if _is_transient_connect_error(err) and not is_last:
                delay = TOOL_RETRY_DELAYS[attempt - 1]
                logger.warning(
                    "[ToolNode] MCP 工具连接失败，准备重试 (%s/%s), %.1fs 后重试: %s",
                    attempt,
                    attempts,
                    delay,
                    err,
                )
                await asyncio.sleep(delay)
                continue
            logger.error("[ToolNode] 工具调用失败: %s", err)
            return {
                "messages": _tool_messages_for_error(
                    state,
                    f"该工具执行时出错。{str(err)[:200]}",
                )
            }

    return {"messages": []}
