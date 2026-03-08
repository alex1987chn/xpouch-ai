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
from agents.tool_policy import build_tool_policy_message, evaluate_tool_policy, get_tool_name
from services.tool_policy_service import tool_policy_service
from tools import ALL_TOOLS as BASE_TOOLS

logger = logging.getLogger(__name__)

# ============================================================================
# 超时配置
# ============================================================================

# 基础工具超时（本地工具，较快）
BASE_TOOL_TIMEOUT = 30
# MCP 工具超时（外部服务，可能需要更长时间）
MCP_TOOL_TIMEOUT = 90
# 最大重试次数
MAX_RETRIES = 2
# 重试延迟（指数退避）
RETRY_DELAYS = [1.0, 2.0]


# ============================================================================
# 错误分类
# ============================================================================


class ToolErrorCategory:
    """工具错误分类"""

    TRANSIENT_NETWORK = "transient_network"  # 临时网络错误，可重试
    MCP_UNAVAILABLE = "mcp_unavailable"  # MCP 服务不可用
    TIMEOUT = "timeout"  # 超时
    UNKNOWN = "unknown"  # 未知错误


def classify_tool_error(err: Exception) -> tuple[ToolErrorCategory, str]:
    """
    分类工具错误，返回错误类别和用户友好的消息。

    Returns:
        tuple: (错误类别, 用户友好消息)
    """
    # 超时错误（MCP 工具通常需要更长时间）
    if isinstance(err, TimeoutError):
        return (
            ToolErrorCategory.TIMEOUT,
            "工具调用超时。外部服务响应较慢，请稍后重试。",
        )

    # HTTP 连接错误
    if isinstance(err, httpx.ConnectTimeout):
        return (
            ToolErrorCategory.TRANSIENT_NETWORK,
            "连接外部服务超时（可能是高德地图 MCP 服务暂时不可用）。请稍后重试，或尝试不使用地图功能的查询。",
        )

    if isinstance(err, httpx.ConnectError):
        return (
            ToolErrorCategory.TRANSIENT_NETWORK,
            "无法连接到外部服务。请检查网络或 MCP 服务器配置。",
        )

    if isinstance(err, httpx.TimeoutException):
        return (
            ToolErrorCategory.TIMEOUT,
            "请求外部服务超时。服务可能暂时不可用，请稍后重试。",
        )

    # MCP 特定的错误（通过错误消息判断）
    err_str = str(err).lower()
    if ("mcp" in err_str or "sse" in err_str) and ("timeout" in err_str or "connect" in err_str):
        return (
            ToolErrorCategory.MCP_UNAVAILABLE,
            "MCP 工具连接失败（外部地图服务暂时不可用）。已自动降级，请稍后重试或使用其他工具。",
        )

    # 默认可重试的网络错误
    if any(
        keyword in err_str
        for keyword in [
            "connection reset",
            "connection aborted",
            "temporarily unavailable",
            "network is unreachable",
        ]
    ):
        return (
            ToolErrorCategory.TRANSIENT_NETWORK,
            "网络连接不稳定，请稍后重试。",
        )

    # 其他未知错误
    return (
        ToolErrorCategory.UNKNOWN,
        f"工具执行时出错: {str(err)[:150]}",
    )


def is_retryable_error(err: Exception) -> bool:
    """判断错误是否可重试"""
    return isinstance(err, httpx.ConnectError | httpx.ConnectTimeout | httpx.TimeoutException)


# ============================================================================
# 错误处理
# ============================================================================


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


# ============================================================================
# 主函数
# ============================================================================


async def dynamic_tool_node(
    state: AgentState, config: RunnableConfig | None = None
) -> dict[str, Any]:
    """
    动态工具节点：合并基础工具与 MCP 工具，带超时与重试。

    特性：
    1. 智能超时：基础工具 30s，MCP 工具 90s
    2. 分类错误处理：区分网络错误、MCP 错误、超时
    3. 指数退避重试：1s, 2s 延迟
    4. 友好降级：用户可理解的错误信息
    """
    mcp_tools = []
    if config and hasattr(config, "get"):
        mcp_tools = config.get("configurable", {}).get("mcp_tools", [])

    runtime_tools = list(BASE_TOOLS) + list(mcp_tools)
    builtin_tool_names = {get_tool_name(tool) for tool in BASE_TOOLS}
    tool_name_to_tool = {get_tool_name(tool): tool for tool in runtime_tools}

    # 如果有 MCP 工具，使用更长的超时
    has_mcp_tools = len(mcp_tools) > 0
    timeout_seconds = MCP_TOOL_TIMEOUT if has_mcp_tools else BASE_TOOL_TIMEOUT

    # 获取工具调用信息用于日志
    messages = (
        state.get("messages", []) if isinstance(state, dict) else getattr(state, "messages", [])
    )
    tool_calls = []
    for msg in reversed(messages):
        if hasattr(msg, "tool_calls") and msg.tool_calls:
            tool_calls = msg.tool_calls
            break

    task_list = state.get("task_list", []) if isinstance(state, dict) else []
    current_task_index = state.get("current_task_index", 0) if isinstance(state, dict) else 0
    current_task = (
        task_list[current_task_index]
        if isinstance(task_list, list) and 0 <= current_task_index < len(task_list)
        else {}
    )
    expert_type = current_task.get("expert_type")
    policy_overrides = await tool_policy_service.get_overrides()

    # 记录工具调用请求
    for tc in tool_calls:
        tool_name = tc.get("name", "unknown")
        tool_args = tc.get("args", {})
        logger.info(
            "[ToolNode] 🔧 工具调用请求 | 工具: %s | 类型: %s | 参数: %s",
            tool_name,
            "MCP" if has_mcp_tools else "BASE",
            str(tool_args)[:200],
        )

    blocked_decisions = []
    for tc in tool_calls:
        tool_name = tc.get("name", "unknown")
        tool = tool_name_to_tool.get(tool_name)
        source = "builtin" if tool_name in builtin_tool_names else "mcp"
        description = getattr(tool, "description", None) if tool is not None else None
        decision = evaluate_tool_policy(
            tool_name=tool_name,
            expert_type=expert_type,
            source=source,
            description=description,
            overrides=policy_overrides,
        )
        if not decision.allowed:
            blocked_decisions.append((tc, decision))

    if blocked_decisions:
        for _tc, decision in blocked_decisions:
            logger.warning(
                "[ToolNode] 工具调用被治理层拦截 | expert=%s tool=%s action=%s reason=%s",
                expert_type,
                decision.tool_name,
                decision.action,
                decision.reason,
            )
        return {
            "messages": [
                ToolMessage(
                    content=build_tool_policy_message(decision),
                    tool_call_id=tc.get("id", "unknown"),
                    name=tc.get("name", "unknown"),
                )
                for tc, decision in blocked_decisions
            ]
        }

    tool_executor = ToolNode(runtime_tools)

    # 执行工具调用（带重试）
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            async with asyncio.timeout(timeout_seconds):
                result = await tool_executor.ainvoke(state, config)

            # 记录成功
            for tc in tool_calls:
                logger.info("[ToolNode] ✅ 工具调用成功 | 工具: %s", tc.get("name", "unknown"))
            return result

        except Exception as err:
            is_last_attempt = attempt >= MAX_RETRIES
            error_category, user_msg = classify_tool_error(err)

            # 可重试错误且不是最后一次
            if is_retryable_error(err) and not is_last_attempt:
                delay = RETRY_DELAYS[attempt - 1]
                logger.warning(
                    "[ToolNode] 工具调用失败，准备重试 (%s/%s), %.1fs 后重试 | 类别: %s | 错误: %s",
                    attempt,
                    MAX_RETRIES,
                    delay,
                    error_category,
                    err,
                )
                await asyncio.sleep(delay)
                continue

            # 记录最终失败
            logger.error(
                "[ToolNode] 工具调用最终失败 | 工具: %s | 类别: %s | 错误: %s",
                tool_calls[0].get("name", "unknown") if tool_calls else "unknown",
                error_category,
                err,
            )

            # 返回降级消息
            return {"messages": _tool_messages_for_error(state, user_msg)}

    return {"messages": []}
