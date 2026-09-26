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
import time
from typing import Any

import httpx
from langchain_core.messages import ToolMessage
from langchain_core.runnables import RunnableConfig

# ToolCallRequest 未从 langgraph.prebuilt 顶层导出，需从子模块导入
from langgraph.prebuilt import ToolNode
from langgraph.prebuilt.tool_node import ToolCallRequest

from agents.event_stream import emit_event
from agents.state import AgentState
from agents.tool_policy import build_tool_policy_message, evaluate_tool_policy, get_tool_name
from event_types.events import ToolResultData
from services.tool_policy_service import tool_policy_service
from tools import ASYNC_TOOLS as BASE_TOOLS
from tools.memory import MEMORY_TOOL_NAMES, build_memory_tools
from utils.event_generator import event_tool_calling, event_tool_result
from utils.logger import logger

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


def build_tool_call_wrapper(
    builtin_tool_names: set[str],
    *,
    config: RunnableConfig | None = None,
    task_id: str | None = None,
    expert_type: str | None = None,
    run_id: str | None = None,
    thread_id: str | None = None,
    execution_plan_id: str | None = None,
):
    """构造 `awrap_tool_call` 包装器：按单个 tool_call 施加超时、重试、错误降级，
    并发射工具可见性事件（tool.calling / tool.result）。

    - 超时值按该工具是内置还是 MCP 选取（不再被同批的 MCP 工具拖宽）
    - 只有可重试错误才退避重试，且只重跑失败的那一个调用
    - 重试耗尽后**在本包装器内**构造错误 ToolMessage——id/name 取自
      `request.tool_call`（精确值，不存在旧实现 "unknown" 兜底那种无效 id）

    事件通道分工（与 task.started 同构）：
    - tool.calling / tool.result 经 emit_event 走实时 SSE + 持久帧（断线重放）；
      重试的每次尝试都发 calling（attempt 标注轮次），result 只在终态发一次
    - tool.result 另写 runevent 账本（时间线页按账本回看，每工具一行汇总）；
      calling 不进账本——回看不需要"开始"行，避免行数翻倍

    task_id 为空（单元测试直调等无任务上下文）时不发射、不写账本；
    emit_event 在无图执行上下文时自身也是 no-op（见 event_stream）。

    为什么错误消息不交给 `handle_tool_errors`（重要）：该回调在 `execute` **内部**
    就执行，异常在那一步已被转成消息返回，本包装器根本看不到异常，
    **重试因此不可能发生**（本文件初版即踩此坑，被测试逮到）。故 ToolNode 以
    `handle_tool_errors=False` 构造，让异常冒泡至此统一处理——超时、重试、降级
    只有一条路径，避免两套机制各管一半。

    形参名用 handler 而非协议文档里的 execute：位置传入，改名不影响协议。
    """

    def _ledger(result_data: ToolResultData) -> None:
        """tool.result 落账本（后台线程，失败只告警不影响流）。"""
        if not (run_id and thread_id):
            return
        try:
            from utils.async_task_queue import async_append_run_event, spawn_background

            spawn_background(
                async_append_run_event(
                    run_id=run_id,
                    event_type="tool_result",
                    thread_id=thread_id,
                    execution_plan_id=execution_plan_id,
                    task_id=task_id,
                    event_data=result_data.model_dump(),
                ),
                label=f"run_event:tool_result:{result_data.tool}",
            )
        except (RuntimeError, ValueError) as event_err:
            logger.warning("[ToolNode] ⚠️ tool_result 账本写入提交失败: %s", event_err)

    async def _wrapper(request: ToolCallRequest, handler):
        call = request.tool_call or {}
        tool_name = call.get("name") or "unknown"
        call_id = call.get("id") or "unknown"
        timeout_seconds = BASE_TOOL_TIMEOUT if tool_name in builtin_tool_names else MCP_TOOL_TIMEOUT
        source = "builtin" if tool_name in builtin_tool_names else "mcp"
        args_summary = str(call.get("args", {}))[:200]

        for attempt in range(1, MAX_ATTEMPTS + 1):
            if task_id:
                await emit_event(
                    event_tool_calling(
                        task_id=task_id,
                        expert_type=expert_type or "unknown",
                        tool=tool_name,
                        source=source,
                        args_summary=args_summary,
                        attempt=attempt,
                    ),
                    config=config,
                )
            started = time.perf_counter()

            try:
                async with asyncio.timeout(timeout_seconds):
                    result = await handler(request)
                duration_ms = int((time.perf_counter() - started) * 1000)
                logger.info("[ToolNode] ✅ 工具 %s 调用成功", tool_name)
                if task_id:
                    result_data = ToolResultData(
                        task_id=task_id,
                        expert_type=expert_type or "unknown",
                        tool=tool_name,
                        source=source,
                        success=True,
                        duration_ms=duration_ms,
                    )
                    await emit_event(event_tool_result(**result_data.model_dump()), config=config)
                    _ledger(result_data)
                return result
            except Exception as err:
                is_last = attempt >= MAX_ATTEMPTS
                category, user_msg = classify_tool_error(err)
                duration_ms = int((time.perf_counter() - started) * 1000)

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
                if task_id:
                    result_data = ToolResultData(
                        task_id=task_id,
                        expert_type=expert_type or "unknown",
                        tool=tool_name,
                        source=source,
                        success=False,
                        duration_ms=duration_ms,
                        error=user_msg,
                    )
                    await emit_event(event_tool_result(**result_data.model_dump()), config=config)
                    _ledger(result_data)
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


def collect_runtime_tools(
    *, expert_type: str | None, branch_context: dict | None, mcp_tools: list
) -> list:
    """运行时工具清单的**单一真相源**（绑定与执行两侧共用，2026-09-26 事故后收敛）。

    此前 generic.py（绑定侧：bind_tools 给 LLM 看 schema）与
    dynamic_tool_node（执行侧：ToolNode 真正跑工具）各自构建清单——记忆
    删除能力上线时只注入了绑定侧，模型按教材调用、执行侧报
    "not a valid tool"（典型双脑分裂）。两侧必须从同一函数取清单，
    结构上不可能再分叉。

    记忆管理工具注入条件：仅 memorize_expert + branch_context 带 user_id
    （闭包捕获用户身份，模型不可填报；缺 user_id 不注入，与写入端
    fail-loud 同一隔离铁律）。
    """
    runtime_tools = list(BASE_TOOLS) + list(mcp_tools)
    memory_user_id = (branch_context or {}).get("user_id")
    if expert_type == "memorize_expert" and memory_user_id:
        runtime_tools.extend(build_memory_tools(memory_user_id))
    return runtime_tools


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

    # 执行侧的专家身份在下方从 current_task 解析；为让 collect_runtime_tools
    # 在此可用，先取一次（与下方 expert_type 同源）
    _current_task = state.get("current_task") if isinstance(state, dict) else None
    _expert_type = (_current_task or {}).get("expert_type")
    _branch_context = state.get("branch_context") if isinstance(state, dict) else None

    runtime_tools = collect_runtime_tools(
        expert_type=_expert_type,
        branch_context=_branch_context,
        mcp_tools=mcp_tools,
    )
    builtin_tool_names = {get_tool_name(tool) for tool in BASE_TOOLS} | set(MEMORY_TOOL_NAMES)
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

    # 工具治理要按「哪个专家在调」判定：执行分支把当前任务放在 state 的
    # `current_task` 里（Send payload 注入，见 agents/expert_worker.py）。
    # 游标 + 列表的旧口径已随 C2 删除——工具节点现在只在分支里跑。
    current_task = state.get("current_task") if isinstance(state, dict) else None
    expert_type = (current_task or {}).get("expert_type")
    branch_context = state.get("branch_context") if isinstance(state, dict) else None
    branch_context = branch_context or {}
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
    # 工具可见性事件（calling/result + 账本）的上下文同批传入。
    tool_executor = ToolNode(
        runtime_tools,
        handle_tool_errors=False,
        awrap_tool_call=build_tool_call_wrapper(
            builtin_tool_names,
            config=config,
            task_id=str((current_task or {}).get("id") or "") or None,
            expert_type=expert_type,
            run_id=branch_context.get("run_id"),
            thread_id=branch_context.get("thread_id"),
            execution_plan_id=branch_context.get("execution_plan_id"),
        ),
    )
    return await tool_executor.ainvoke(state, config)
