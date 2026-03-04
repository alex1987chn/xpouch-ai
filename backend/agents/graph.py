"""
XPouch AI LangGraph 工作流定义 (v3.1.0)

[架构]
用户输入 -> Router -> [Simple/Direct | Complex]
                              |
                              v
                    Commander (任务规划)
                              |
                              v
                    HumanReview (HITL 中断点)
                              |
                              v
        Loop: Dispatcher -> Generic Worker -> (工具调用?) -> ToolNode
                              |
                              v
                    Aggregator (结果聚合)
                              |
                              v
                         最终回复

[节点职责]
- router_node: 意图识别，判断 simple/complex/direct
- commander_node: 复杂任务拆解为 SubTasks（DAG 依赖）
- expert_dispatcher_node: 检查专家配置，分发到执行节点
- generic_worker_node: 通用专家执行（支持工具调用 + 流式输出）
- aggregator_node: 聚合专家结果，生成最终回复
- direct_reply_node: 简单模式直接回复

[状态流转]
AgentState:
  - messages: 对话历史
  - task_list: 子任务列表（Commander 生成）
  - current_task_index: 当前执行索引
  - expert_results: 专家执行结果
  - event_queue: SSE 事件队列（Server-Driven UI）

[工具集成]
- search_web: Tavily 联网搜索
- read_webpage: Jina 网页阅读
- get_current_time: 时间查询
- calculator: 数学计算

[持久化]
- MemorySaver: 内存检查点（简单模式）
- AsyncPostgresSaver: 数据库存储（HITL 断点续传）

[入口函数]
- create_smart_router_workflow(): 创建完整工作流（支持 HITL）
"""

import logging
import pathlib
from datetime import datetime, timedelta
from functools import lru_cache
from typing import Any

from dotenv import load_dotenv
from langchain_core.messages import HumanMessage, ToolMessage
from langchain_core.runnables import RunnableConfig  # 🔥 MCP: 用于动态工具注入
from langgraph.checkpoint.base import BaseCheckpointSaver  # 🔥 新增：Checkpointer 基类

# 🔥 保留 MemorySaver 作为 fallback
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, StateGraph
from langgraph.prebuilt import ToolNode  # 🔥 新增：工具执行节点

# v3.1: 从 nodes 模块导入所有节点函数（重构后）
from agents.state import AgentState

# 导入数据模型
from config import get_langsmith_config, init_langchain_tracing
from tools import ALL_TOOLS as BASE_TOOLS  # 🔥 新增：导入基础工具集

logger = logging.getLogger(__name__)

# LangSmith 链路追踪
env_path = pathlib.Path(__file__).parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

langsmith_config = get_langsmith_config()
if langsmith_config["enabled"]:
    init_langchain_tracing(langsmith_config)

TOOL_LOOP_WINDOW = 20
TOOL_LOOP_MAX_TOTAL = 12
TOOL_LOOP_MAX_SAME_TOOL_STREAK = 4
TOOL_LOOP_MAX_PING_PONG = 8
TOOL_LOOP_TIME_WINDOW_SECONDS = 30
TOOL_LOOP_MAX_IN_TIME_WINDOW = 8


def get_router_llm_lazy():
    """延迟初始化 Router LLM"""
    return _get_router_llm_cached()


def get_commander_llm_lazy():
    """延迟初始化 Commander LLM"""
    return _get_commander_llm_cached()


def get_simple_llm_lazy():
    """延迟初始化 Simple 模式 LLM"""
    return _get_simple_llm_cached()


@lru_cache(maxsize=1)
def _get_router_llm_cached():
    from utils.llm_factory import get_router_llm

    return get_router_llm()


@lru_cache(maxsize=1)
def _get_commander_llm_cached():
    from utils.llm_factory import get_commander_llm

    return get_commander_llm()


@lru_cache(maxsize=1)
def _get_simple_llm_cached():
    from providers_config import is_provider_configured
    from utils.llm_factory import get_llm_instance, get_router_llm

    try:
        if is_provider_configured("minimax"):
            return get_llm_instance(provider="minimax", streaming=True, temperature=0.7)
    except Exception:
        pass
    return get_router_llm()


# ============================================================================
# 4. 条件路由逻辑 (Edges)
# ============================================================================


def route_router(state: AgentState) -> str:
    """Router 之后的去向"""
    decision = state.get("router_decision", "complex")

    if decision == "simple":
        # Simple 模式进入 direct_reply 节点
        return "direct_reply"
    else:
        # Complex 模式进入指挥官
        return "commander"


def route_dispatcher(state: AgentState) -> str:
    """
    决定循环的去向：继续执行下一个任务 或 聚合结果

    注意：这个路由函数在 Generic Worker 执行后被调用
    Generic Worker 执行完任务后，current_index 不会自动增加
    增加 current_index 的逻辑应该在 generic_worker_node 中实现
    """
    task_list = state.get("task_list", [])
    current_index = state.get("current_task_index", 0)

    # 检查是否还有任务
    if current_index >= len(task_list):
        return "aggregator"  # 所有任务完成，去聚合

    # 还有任务，需要回到 Dispatcher 让它检查并分发
    return "expert_dispatcher"


def route_generic(state: AgentState) -> str:
    """
    Generic Worker 之后的条件路由

    1. 检查是否有工具调用请求，如果有则执行工具
    2. 如果工具执行完成（最后一条是 ToolMessage），回到 Generic 继续处理
    3. 如果没有工具调用，检查任务是否完成
    """
    from langchain_core.messages import ToolMessage

    messages = state.get("messages", [])
    current_index = state.get("current_task_index", 0)
    task_list = state.get("task_list", [])

    if not messages:
        return route_dispatcher(state)

    # 获取最后一条消息
    last_message = messages[-1]

    # ARCH-11: 更稳健的工具循环检测（总量 + 连续同工具 + ping-pong）
    should_break, reason = _should_trip_tool_loop_guard(messages)
    if should_break:
        logger.warning("[RouteGeneric] 熔断触发：%s，强制结束任务", reason)
        return "aggregator"

    # 情况1：LLM 返回了 tool_calls，需要执行工具
    if hasattr(last_message, "tool_calls") and last_message.tool_calls:
        return "tools"

    # 情况2：最后一条是 ToolMessage，说明工具刚执行完
    # 需要回到 Generic 让 LLM 处理工具结果
    if isinstance(last_message, ToolMessage):
        return "generic"

    # 情况3：检查任务是否完成
    # 如果 current_index >= len(task_list)，说明所有任务已完成
    if current_index >= len(task_list):
        return "aggregator"

    # 情况4：还有任务，继续执行
    return route_dispatcher(state)


def _should_trip_tool_loop_guard(messages: list[Any]) -> tuple[bool, str]:
    """检测工具调用是否进入可疑循环。"""
    recent_messages = messages[-TOOL_LOOP_WINDOW:]
    tool_messages = [
        msg for msg in recent_messages if isinstance(msg, ToolMessage) and getattr(msg, "name", "")
    ]
    tool_names = [msg.name for msg in tool_messages]

    if len(tool_names) >= TOOL_LOOP_MAX_TOTAL:
        return True, f"最近 {TOOL_LOOP_WINDOW} 条内工具调用过多({len(tool_names)})"

    # 时间窗口熔断：短时间内工具调用过于密集，通常意味着抖动/重试风暴
    now = datetime.now()
    recent_by_time = 0
    for msg in tool_messages:
        msg_ts = _extract_tool_message_timestamp(msg)
        if msg_ts and now - msg_ts <= timedelta(seconds=TOOL_LOOP_TIME_WINDOW_SECONDS):
            recent_by_time += 1
    if recent_by_time >= TOOL_LOOP_MAX_IN_TIME_WINDOW:
        return True, f"{TOOL_LOOP_TIME_WINDOW_SECONDS}s 内工具调用过多({recent_by_time})"

    # 连续同一个工具反复调用
    if tool_names:
        tail_name = tool_names[-1]
        same_streak = 0
        for name in reversed(tool_names):
            if name == tail_name:
                same_streak += 1
            else:
                break
        if same_streak >= TOOL_LOOP_MAX_SAME_TOOL_STREAK:
            return True, f"工具 {tail_name} 连续调用 {same_streak} 次"

    # ABAB... 的 ping-pong 循环（常见于工具失败重试抖动）
    if len(tool_names) >= TOOL_LOOP_MAX_PING_PONG:
        tail = tool_names[-TOOL_LOOP_MAX_PING_PONG:]
        first, second = tail[0], tail[1]
        if first != second and all(
            name == (first if idx % 2 == 0 else second) for idx, name in enumerate(tail)
        ):
            return True, f"检测到工具 ping-pong 循环({first}<->{second})"

    return False, ""


def _extract_tool_message_timestamp(msg: ToolMessage) -> datetime | None:
    """从 ToolMessage 中尽力提取时间戳。"""
    candidates = []
    additional = getattr(msg, "additional_kwargs", None) or {}
    metadata = getattr(msg, "response_metadata", None) or {}

    for key in ("ts", "timestamp", "created_at"):
        if key in additional:
            candidates.append(additional[key])
        if key in metadata:
            candidates.append(metadata[key])

    for raw in candidates:
        if not raw:
            continue
        if isinstance(raw, datetime):
            return raw
        if isinstance(raw, str):
            normalized = raw.replace("Z", "+00:00")
            try:
                return datetime.fromisoformat(normalized)
            except ValueError:
                continue
    return None


# ============================================================================
# 5. 构建工作流图
# ============================================================================


def create_smart_router_workflow(checkpointer: BaseCheckpointSaver | None = None) -> StateGraph:
    """
    创建智能路由工作流

    Args:
        checkpointer: 可选的状态检查点保存器，用于 HITL (Human-in-the-Loop)
                     如果传入 AsyncPostgresSaver，则状态会持久化到 PostgreSQL
                     如果为 None，则使用 MemorySaver（内存存储，适合开发/测试）

    Returns:
        编译后的 StateGraph 工作流
    """
    # B-9: 节点函数延迟导入，避免 graph <-> services/nodes 导入链循环放大
    from agents.nodes import (
        aggregator_node,
        commander_node,
        direct_reply_node,
        expert_dispatcher_node,
        generic_worker_node,
        router_node,
    )

    workflow = StateGraph(AgentState)

    # 添加节点
    workflow.add_node("router", router_node)
    workflow.add_node("direct_reply", direct_reply_node)  # 新增：Simple 模式流式回复
    workflow.add_node("commander", commander_node)
    workflow.add_node("expert_dispatcher", expert_dispatcher_node)
    workflow.add_node("generic", generic_worker_node)  # 新增：通用专家执行节点
    workflow.add_node("aggregator", aggregator_node)

    # 🔥 MCP: 动态工具执行节点
    # 使用函数包装，支持从 config 获取动态 MCP 工具
    # P1 修复: 添加工具调用错误处理和超时控制
    async def dynamic_tool_node(state: AgentState, config: RunnableConfig = None):
        """动态工具节点：合并基础工具和 MCP 工具

        P1 修复:
        - 添加工具调用超时控制（60秒）
        - 捕获工具调用异常，返回友好错误信息
        - 防止单个 MCP 工具失败导致整个流程崩溃
        """
        import asyncio

        import httpx
        from langchain_core.messages import ToolMessage

        mcp_tools = []
        if config and hasattr(config, "get"):
            mcp_tools = config.get("configurable", {}).get("mcp_tools", [])

        runtime_tools = list(BASE_TOOLS) + list(mcp_tools)
        tool_executor = ToolNode(runtime_tools)

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

        try:
            # P1 修复: 添加 60 秒超时控制
            # P0 增强: 网络连接类错误自动重试，降低 MCP 短暂抖动影响
            retry_delays = [0.8, 1.6]  # 最多 3 次尝试
            attempts = len(retry_delays) + 1
            for attempt in range(1, attempts + 1):
                try:
                    async with asyncio.timeout(60):
                        return await tool_executor.ainvoke(state, config)
                except Exception as err:
                    is_last_attempt = attempt >= attempts
                    if _is_transient_connect_error(err) and not is_last_attempt:
                        delay = retry_delays[attempt - 1]
                        logger.warning(
                            "[ToolNode] MCP 工具连接失败，准备重试 (%s/%s), %.1fs 后重试: %s",
                            attempt,
                            attempts,
                            delay,
                            err,
                        )
                        await asyncio.sleep(delay)
                        continue
                    raise
        except TimeoutError:
            # 工具调用超时，返回错误信息
            logger.error("[ToolNode] 工具调用超时 (60秒)")
            # 获取最后一条 AI Message 的 tool_calls
            messages = state.get("messages", [])
            tool_messages = []
            for msg in reversed(messages):
                if hasattr(msg, "tool_calls") and msg.tool_calls:
                    for tc in msg.tool_calls:
                        tool_messages.append(
                            ToolMessage(
                                content="工具调用超时 (60秒)。该服务可能暂时不可用或响应过慢，请稍后重试或尝试其他工具。",
                                tool_call_id=tc.get("id", "unknown"),
                                name=tc.get("name", "unknown"),
                            )
                        )
                    break
            return {"messages": tool_messages}
        except Exception as e:
            # P1 修复: 捕获其他异常，返回友好错误信息
            logger.error(f"[ToolNode] 工具调用失败: {e}")
            messages = state.get("messages", [])
            tool_messages = []
            for msg in reversed(messages):
                if hasattr(msg, "tool_calls") and msg.tool_calls:
                    for tc in msg.tool_calls:
                        error_msg = f"工具调用失败: {str(e)[:200]}"
                        tool_messages.append(
                            ToolMessage(
                                content=f"该工具执行时出错。{error_msg}",
                                tool_call_id=tc.get("id", "unknown"),
                                name=tc.get("name", "unknown"),
                            )
                        )
                    break
            return {"messages": tool_messages}

    workflow.add_node("tools", dynamic_tool_node)

    # 设置入口：现在入口是 Router！
    workflow.set_entry_point("router")

    # 添加连线

    # 1. Router -> (Direct Reply | Commander)
    workflow.add_conditional_edges(
        "router", route_router, {"direct_reply": "direct_reply", "commander": "commander"}
    )

    # 2. Direct Reply -> END
    workflow.add_edge("direct_reply", END)

    # 3. Commander -> Dispatcher (指挥官完成后执行)
    workflow.add_edge("commander", "expert_dispatcher")

    # 4. Dispatcher -> Generic (专家执行)
    # Dispatcher 检查专家存在后，流转到 Generic 执行
    workflow.add_edge("expert_dispatcher", "generic")

    # 5. Generic -> (Tools | Generic | Dispatcher | Aggregator)
    # Generic 执行任务后，根据是否有工具调用请求或任务状态决定去向
    workflow.add_conditional_edges(
        "generic",
        route_generic,
        {
            "tools": "tools",  # 有工具调用，执行工具
            "generic": "generic",  # 工具执行完，回到 Generic 处理结果
            "expert_dispatcher": "expert_dispatcher",  # 继续下一个任务
            "aggregator": "aggregator",  # 所有任务完成，去聚合结果
        },
    )

    # 6. Tools -> Generic (工具执行完，回到 Generic 继续处理)
    # 工具执行完后，LLM 会继续响应，可能再次调用工具或完成任务
    workflow.add_edge("tools", "generic")

    # 7. Aggregator -> END
    workflow.add_edge("aggregator", END)

    # ---------------------------------------------------------
    # 🔥 修改开始：添加 Checkpointer (HITL 支持)
    # ---------------------------------------------------------
    # 如果未传入 checkpointer，使用 MemorySaver 作为 fallback
    if checkpointer is None:
        logger.info("[Graph] Using MemorySaver (non-persistent, for dev/test only)")
        checkpointer = MemorySaver()
    else:
        logger.info(f"[Graph] Using persistent checkpointer: {type(checkpointer).__name__}")

    # 编译时传入 checkpointer
    # 🔥🔥🔥 HITL 中断点：在 expert_dispatcher 前暂停，允许人类审核计划
    compiled_workflow = workflow.compile(
        checkpointer=checkpointer,
        interrupt_before=["expert_dispatcher"],  # Commander 规划完成后暂停，等待人类确认
    )
    # ---------------------------------------------------------
    # 🔥 修改结束

    return compiled_workflow


# ============================================================================
# 全局默认 Graph（向后兼容）
# ============================================================================
def get_default_commander_graph():
    """获取默认 commander graph（使用 MemorySaver，缓存实例）。"""
    return _get_default_commander_graph_cached()


@lru_cache(maxsize=1)
def _get_default_commander_graph_cached():
    return create_smart_router_workflow()


# ============================================================================
# 测试封装函数
# ============================================================================


async def execute_commander_workflow(
    user_query: str, thread_id: str = "test_thread", checkpointer: BaseCheckpointSaver | None = None
) -> dict[str, Any]:
    """
    执行 Commander 工作流

    Args:
        user_query: 用户查询
        thread_id: 线程 ID
        checkpointer: 可选的持久化检查点

    Returns:
        最终状态
    """
    logger.info(f"--- [START] 查询: {user_query} ---")

    # 根据是否传入 checkpointer 创建 graph
    if checkpointer:
        graph = create_smart_router_workflow(checkpointer=checkpointer)
    else:
        graph = get_default_commander_graph()

    initial_state: AgentState = {
        "messages": [HumanMessage(content=user_query)],
        "task_list": [],
        "current_task_index": 0,
        "strategy": "",
        "expert_results": [],
        "final_response": "",
    }

    # 🔥 添加 config 传递 thread_id 给 checkpointer，并设置递归限制
    # 注意：recursion_limit 必须在 config 顶层，不能在 configurable 中
    final_state = await graph.ainvoke(
        initial_state,
        config={
            "recursion_limit": 100,  # 🔥 设置递归限制（放在顶层！）
            "configurable": {"thread_id": thread_id},
        },
    )
    logger.info("--- [DONE] ---")
    return final_state


if __name__ == "__main__":
    import asyncio

    async def test():
        # 测试 1: 简单闲聊
        logger.info("\n=== 测试 1: 简单模式 ===")
        await execute_commander_workflow("你好，在吗？")

        # 测试 2: 复杂任务
        logger.info("\n=== 测试 2: 复杂模式 ===")
        await execute_commander_workflow("帮我写一个 Python 脚本来抓取股票价格。")

    asyncio.run(test())
