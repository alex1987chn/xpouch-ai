"""
XPouch AI 智能路由工作流 (v3.0 架构)
集成意图识别 (Router) -> 任务指挥官 (Commander) -> 专家执行 (Experts)
支持事件溯源持久化和 Server-Driven UI
"""
from typing import Dict, Any
from langgraph.graph import StateGraph, END
from langchain_core.messages import HumanMessage, ToolMessage
from langgraph.prebuilt import ToolNode  # 🔥 新增：工具执行节点
from dotenv import load_dotenv
import pathlib

# 🔥 新增：导入 MemorySaver 支持状态管理
from langgraph.checkpoint.memory import MemorySaver

# 导入数据模型
import sys
sys.path.append(str(pathlib.Path(__file__).parent.parent))
from config import init_langchain_tracing, get_langsmith_config

# v3.1: 从 nodes 模块导入所有节点函数（重构后）
from agents.nodes import (
    router_node,
    direct_reply_node,
    commander_node,
    expert_dispatcher_node,
    generic_worker_node,
    aggregator_node,
)
from agents.state import AgentState
from tools import ALL_TOOLS  # 🔥 新增：导入工具集

# LangSmith 链路追踪
env_path = pathlib.Path(__file__).parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

langsmith_config = get_langsmith_config()
if langsmith_config["enabled"]:
    init_langchain_tracing(langsmith_config)

# v3.0: 延迟初始化 LLM - 避免模块加载时就创建实例
_router_llm = None
_commander_llm = None
_simple_llm = None

def get_router_llm_lazy():
    """延迟初始化 Router LLM"""
    global _router_llm
    if _router_llm is None:
        from utils.llm_factory import get_router_llm
        _router_llm = get_router_llm()
    return _router_llm

def get_commander_llm_lazy():
    """延迟初始化 Commander LLM"""
    global _commander_llm
    if _commander_llm is None:
        from utils.llm_factory import get_commander_llm
        _commander_llm = get_commander_llm()
    return _commander_llm

def get_simple_llm_lazy():
    """延迟初始化 Simple 模式 LLM"""
    global _simple_llm
    if _simple_llm is None:
        from providers_config import is_provider_configured
        from utils.llm_factory import get_llm_instance, get_router_llm
        try:
            if is_provider_configured('minimax'):
                _simple_llm = get_llm_instance(provider='minimax', streaming=True, temperature=0.7)
                print("[LLM] Simple 模式使用: MiniMax-M2.1")
            else:
                _simple_llm = get_router_llm()
                print("[LLM] Simple 模式回退到 Router LLM")
        except Exception as e:
            print(f"[LLM] Simple 模式初始化失败，回退到 Router: {e}")
            _simple_llm = get_router_llm()
    return _simple_llm


# ============================================================================
# 4. 条件路由逻辑 (Edges)
# ============================================================================

def route_router(state: AgentState) -> str:
    """Router 之后的去向"""
    decision = state.get("router_decision", "complex")

    print(f"[ROUTE_ROUTER] 决策: {decision}, 将路由到: {'direct_reply' if decision == 'simple' else 'commander'}")

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
    # Dispatcher 会检查任务并决定是否继续
    return "expert_dispatcher"


def route_generic(state: AgentState) -> str:
    """
    Generic Worker 之后的条件路由

    1. 检查是否有工具调用请求，如果有则执行工具
    2. 如果工具执行完成（最后一条是 ToolMessage），回到 Generic 继续处理
    3. 如果没有工具调用，检查任务是否完成
    """
    from langchain_core.messages import ToolMessage, AIMessage

    messages = state.get("messages", [])
    current_index = state.get("current_task_index", 0)
    task_list = state.get("task_list", [])

    if not messages:
        return route_dispatcher(state)

    # 🔥🔥🔥 熔断机制 (Circuit Breaker) 🔥🔥🔥
    # 检查最近的 ToolMessage 数量，防止无限循环
    recent_tool_count = sum(1 for msg in messages[-10:] if isinstance(msg, ToolMessage))
    if recent_tool_count >= 5:
        print(f"[ROUTE_GENERIC] 🛑 熔断触发：最近已执行 {recent_tool_count} 次工具，强制结束任务！")
        return "aggregator"

    # 🔥 情况1：LLM 返回了 tool_calls，需要执行工具
    if hasattr(last_message, "tool_calls") and last_message.tool_calls:
        return "tools"

    # 🔥 情况2：最后一条是 ToolMessage，说明工具刚执行完
    # 需要回到 Generic 让 LLM 处理工具结果
    if isinstance(last_message, ToolMessage):
        return "generic"

    # 🔥 情况3：检查任务是否完成
    # 如果 current_index >= len(task_list)，说明所有任务已完成
    if current_index >= len(task_list):
        return "aggregator"

    # 情况4：还有任务，继续执行
    return route_dispatcher(state)

# ============================================================================
# 5. 构建工作流图
# ============================================================================

def create_smart_router_workflow() -> StateGraph:
    workflow = StateGraph(AgentState)

    # 添加节点
    workflow.add_node("router", router_node)
    workflow.add_node("direct_reply", direct_reply_node)  # 新增：Simple 模式流式回复
    workflow.add_node("commander", commander_node)
    workflow.add_node("expert_dispatcher", expert_dispatcher_node)
    workflow.add_node("generic", generic_worker_node)  # 新增：通用专家执行节点
    workflow.add_node("aggregator", aggregator_node)

    # 🔥 新增：工具执行节点
    tool_node = ToolNode(ALL_TOOLS)
    workflow.add_node("tools", tool_node)
    print(f"[WORKFLOW] ✅ 已注册工具节点，包含 {len(ALL_TOOLS)} 个工具: {[t.name for t in ALL_TOOLS]}")

    # 设置入口：现在入口是 Router！
    workflow.set_entry_point("router")

    # 添加连线

    # 1. Router -> (Direct Reply | Commander)
    workflow.add_conditional_edges(
        "router",
        route_router,
        {
            "direct_reply": "direct_reply",
            "commander": "commander"
        }
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
            "aggregator": "aggregator"  # 所有任务完成，去聚合结果
        }
    )

    # 6. Tools -> Generic (工具执行完，回到 Generic 继续处理)
    # 工具执行完后，LLM 会继续响应，可能再次调用工具或完成任务
    workflow.add_edge("tools", "generic")

    # 7. Aggregator -> END
    workflow.add_edge("aggregator", END)

    # ---------------------------------------------------------
    # 🔥 修改开始：添加 Checkpointer
    # ---------------------------------------------------------
    # 初始化内存检查点
    # 这会让 LangGraph 把状态保存在内存里，不会阻塞数据库，也不会导致 Cloudflare 超时
    memory = MemorySaver()

    # 编译时传入 checkpointer
    compiled_workflow = workflow.compile(checkpointer=memory)
    # ---------------------------------------------------------
    # 🔥 修改结束

    return compiled_workflow

# 导出编译后的图
commander_graph = create_smart_router_workflow()

# ============================================================================
# 测试封装函数
# ============================================================================

async def execute_commander_workflow(user_query: str, thread_id: str = "test_thread") -> dict[str, Any]:
    print(f"--- [START] 查询: {user_query} ---")
    initial_state: AgentState = {
        "messages": [HumanMessage(content=user_query)],
        "task_list": [],
        "current_task_index": 0,
        "strategy": "",
        "expert_results": [],
        "final_response": ""
    }
    # 🔥 添加 config 传递 thread_id 给 MemorySaver，并设置递归限制
    # 注意：recursion_limit 必须在 config 顶层，不能在 configurable 中
    final_state = await commander_graph.ainvoke(
        initial_state,
        config={
            "recursion_limit": 100,  # 🔥 设置递归限制（放在顶层！）
            "configurable": {
                "thread_id": thread_id
            }
        }
    )
    print("--- [DONE] ---")
    return final_state

if __name__ == "__main__":
    import asyncio
    async def test():
        # 测试 1: 简单闲聊
        print("\n=== 测试 1: 简单模式 ===")
        await execute_commander_workflow("你好，在吗？")
        
        # 测试 2: 复杂任务
        print("\n=== 测试 2: 复杂模式 ===")
        await execute_commander_workflow("帮我写一个 Python 脚本来抓取股票价格。")
    
    asyncio.run(test())
