"""
XPouch AI 智能路由工作流 (v3.0 架构)
集成意图识别 (Router) -> 任务指挥官 (Commander) -> 专家执行 (Experts)
支持事件溯源持久化和 Server-Driven UI
"""
from typing import Dict, Any
from langgraph.graph import StateGraph, END
from langchain_core.messages import HumanMessage
from dotenv import load_dotenv
import pathlib

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
    aggregator_node,
)
from agents.state import AgentState

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
    """决定 分发器 之后的去向（循环或聚合）"""
    if state["current_task_index"] >= len(state["task_list"]):
        return "aggregator"
    return "expert_dispatcher"

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
    workflow.add_node("aggregator", aggregator_node)

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

    # 3. Dispatcher -> (Loop | Aggregator)
    workflow.add_conditional_edges(
        "expert_dispatcher",
        route_dispatcher,
        {
            "expert_dispatcher": "expert_dispatcher",
            "aggregator": "aggregator"
        }
    )

    # 4. Aggregator -> END
    workflow.add_edge("aggregator", END)

    return workflow.compile()

# 导出编译后的图
commander_graph = create_smart_router_workflow()

# ============================================================================
# 测试封装函数
# ============================================================================

async def execute_commander_workflow(user_query: str) -> dict[str, Any]:
    print(f"--- [START] 查询: {user_query} ---")
    initial_state: AgentState = {
        "messages": [HumanMessage(content=user_query)],
        "task_list": [],
        "current_task_index": 0,
        "strategy": "",
        "expert_results": [],
        "final_response": ""
    }
    final_state = await commander_graph.ainvoke(initial_state)
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
