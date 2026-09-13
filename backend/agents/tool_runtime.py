"""
工具节点运行时：超时、重试、错误降级。
供 graph_builder 组装进 StateGraph，与图定义解耦。

粒度说明（本版修正的核心）：超时与重试都是「每个 tool_call」而非「整个节点」。
此前用 asyncio.timeout 包住整次节点调用，有三个后果：①同批多个调用共享同一
预算，一个慢工具吃掉其余的；②超时值按「本 run 是否挂了 MCP」二选一，挂了 MCP
时连本地工具也一起放宽；③重试重跑整批——3 个调用里第 3 个失败时，前 2 个已
成功的会再执行一遍（写类外部工具即重复副作用）。现经 awrap_tool_call 逐调用
包装。错误文案交给 handle_tool_errors，由框架构造带正确 tool_call_id / name
且 status="error" 的消息（手写版用 "unknown" 兜底会产生无效 tool_call_id）。
"""

import asyncio
import logging
from typing import Any

import httpx
from langchain_core.messages import ToolMessage
from langchain_core.runnables import RunnableConfig

# ToolCallRequest 未从 langgraph.prebuilt 顶层导出，需从子模块导入
from langgraph.prebuilt import ToolNode
from langgraph.prebuilt.tool_node import ToolCallRequest

from agents.state import AgentState
from agents.tool_policy import build_tool_policy_message, evaluate_tool_policy, get_tool_name
from services.tool_policy_service import tool_policy_service
from tools import ASYNC_TOOLS as BASE_TOOLS

logger = logging.getLogger(__name__)

# ============================================================================
# 超时配置
# ============================================================================

# 基础工具超时（本地工具，较快）
BASE_TOOL_TIMEOUT = 30
# MCP 工具超时（外部服务，可能需要更长时间）
MCP_TOOL_TIMEOUT = 90
# 单个 tool_call 的最大尝试次数（1 次原始调用 + 1 次重试）。
# 注：原常量名为 MAX_RETRIES=2 却表示「2 次尝试」，名实不符，此处改正命名。
MAX_ATTEMPTS = 2
# 重试前的退避延迟（按尝试序号取用）
RETRY_DELAYS = [1.0, 2.0]
# 判定「可重试网络错误」的消息关键词（httpx 异常类型之外的一层兜底）
RETRYABLE_MESSAGE_HINTS = (
    "connection reset",
    "connection aborted",
    "temporarily unavailable",
    "network is unreachable",
)


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

    # 默认可重试的网络错误（httpx 异常类型未覆盖的情形，按消息关键词兜底）
    lowered = str(err).lower()
    if any(hint in lowered for hint in RETRYABLE_MESSAGE_HINTS):
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


def build_tool_call_wrapper(builtin_tool_names: set[str]):
    """构造 `awrap_tool_call` 包装器：按单个 tool_call 施加超时、重试与错误降级。

    - 超时值按该工具是内置还是 MCP 选取（不再被同批的 MCP 工具拖宽）
    - 只有可重试错误才退避重试，且只重跑失败的那一个调用
    - 重试耗尽后**在本包装器内**构造错误 ToolMessage——id/name 取自
      `request.tool_call`（精确值，不存在旧实现 "unknown" 兜底那种无效 id）

    为什么错误消息不交给 `handle_tool_errors`（重要）：该回调在 `execute` **内部**
    就执行，异常在那一步已被转成消息返回，本包装器根本看不到异常，
    **重试因此不可能发生**（本文件初版即踩此坑，被测试逮到）。故 ToolNode 以
    `handle_tool_errors=False` 构造，让异常冒泡至此统一处理——超时、重试、降级
    只有一条路径，避免两套机制各管一半。

    形参名用 handler 而非协议文档里的 execute：位置传入，改名不影响协议。
    """

    async def _wrapper(request: ToolCallRequest, handler):
        call = request.tool_call or {}
        tool_name = call.get("name") or "unknown"
        call_id = call.get("id") or "unknown"
        timeout_seconds = BASE_TOOL_TIMEOUT if tool_name in builtin_tool_names else MCP_TOOL_TIMEOUT

        for attempt in range(1, MAX_ATTEMPTS + 1):
            try:
                async with asyncio.timeout(timeout_seconds):
                    return await handler(request)
            except Exception as err:
                is_last = attempt >= MAX_ATTEMPTS
                category, user_msg = classify_tool_error(err)

                if is_retryable_error(err) and not is_last:
                    delay = RETRY_DELAYS[attempt - 1]
                    logger.warning(
                        "[ToolNode] 工具 %s 失败，%.1fs 后重试 (%s/%s) | 类别: %s | 错误: %s",
                        tool_name,
                        delay,
                        attempt,
                        MAX_ATTEMPTS,
                        category,
                        err,
                    )
                    await asyncio.sleep(delay)
                    continue

                logger.error(
                    "[ToolNode] 工具 %s 最终失败 | 类别: %s | 错误: %s",
                    tool_name,
                    category,
                    err,
                )
                return ToolMessage(
                    content=user_msg,
                    tool_call_id=call_id,
                    name=tool_name,
                    status="error",
                )

    return _wrapper


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

    # 超时值在 build_tool_call_wrapper 内按**单个工具**选取，
    # 此处仅保留「本 run 是否挂了 MCP」用于日志标注
    has_mcp_tools = len(mcp_tools) > 0

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

    # 超时/重试/错误降级统一由 awrap_tool_call 包装器完成（见其 docstring：
    # handle_tool_errors 在 execute 内部就会吞掉异常，导致重试不可能发生）。
    tool_executor = ToolNode(
        runtime_tools,
        handle_tool_errors=False,
        awrap_tool_call=build_tool_call_wrapper(builtin_tool_names),
    )
    return await tool_executor.ainvoke(state, config)
