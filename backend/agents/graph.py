"""
XPouch AI 智能路由工作流 (v2.7 架构)
集成意图识别 (Router) -> 任务规划 (Planner) -> 专家执行 (Experts)
"""
from typing import TypedDict, Annotated, List, Dict, Any, Literal
from langgraph.graph import StateGraph, END, START
from langgraph.graph.message import add_messages
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage, BaseMessage
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser, PydanticOutputParser
import os
from dotenv import load_dotenv
import pathlib
from pydantic import BaseModel, Field
from uuid import uuid4
from datetime import datetime

# 导入数据模型
import sys
sys.path.append(str(pathlib.Path(__file__).parent.parent))
from models import ExpertType, TaskStatus, SubTask
from config import init_langchain_tracing, get_langsmith_config
from utils.json_parser import parse_llm_json
from utils.exceptions import AppError
# 将原有的 COMMANDER_SYSTEM_PROMPT 作为规划器 (Planner) 的提示词
from constants import COMMANDER_SYSTEM_PROMPT as PLANNER_SYSTEM_PROMPT, ROUTER_SYSTEM_PROMPT, DEFAULT_ASSISTANT_PROMPT 
from agents.dynamic_experts import DYNAMIC_EXPERT_FUNCTIONS, initialize_expert_cache
from agents.expert_loader import get_expert_config_cached

# ============================================================================
# 0. 设置与配置
# ============================================================================
env_path = pathlib.Path(__file__).parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

api_key = os.getenv("OPENAI_API_KEY") or os.getenv("DEEPSEEK_API_KEY")
base_url = os.getenv("OPENAI_BASE_URL") or os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")
model_name = os.getenv("MODEL_NAME", "deepseek-chat")

# LangSmith 链路追踪
langsmith_config = get_langsmith_config()
if langsmith_config["enabled"]:
    init_langchain_tracing(langsmith_config)

# 初始化 LLM
# 建议：如果可能，Router 可以使用更快的模型（如 gpt-4o-mini），这里暂时复用主配置
llm = ChatOpenAI(
    model=model_name,
    temperature=0.3, # Router 需要更确定的输出，稍微降低温度
    api_key=api_key,
    base_url=base_url,
    streaming=True
)

# ============================================================================
# 1. 结构定义与提示词 (新的 Router 逻辑)
# ============================================================================
# ROUTER_SYSTEM_PROMPT 已从 constants.py 导入

class RoutingDecision(BaseModel):
    """v2.7 网关决策结构（Router只负责分类）"""
    decision_type: Literal["simple", "complex"] = Field(description="决策类型")

# --- 保留原有的规划器结构 (原 CommanderOutput) ---

class SubTaskOutput(BaseModel):
    """单个子任务结构 (Planner 使用)"""
    expert_type: ExpertType = Field(description="执行此任务的专家类型")
    description: str = Field(description="任务描述")
    input_data: Dict[str, Any] = Field(default={}, description="输入参数")
    priority: int = Field(default=0, description="优先级 (0=最高)")

class PlannerOutput(BaseModel):
    """规划器输出 - 子任务列表 (原 CommanderOutput)"""
    tasks: List[SubTaskOutput] = Field(description="子任务列表")
    strategy: str = Field(description="执行策略概述")
    estimated_steps: int = Field(description="预计步骤数")

# ============================================================================
# 2. 状态定义
# ============================================================================

class AgentState(TypedDict):
    """超智能体的全局状态"""
    messages: Annotated[List[BaseMessage], add_messages]
    task_list: List[Dict[str, Any]]
    current_task_index: int
    strategy: str
    expert_results: List[Dict[str, Any]]
    final_response: str
    # 新增：记录路由决策信息
    router_decision: str 

# ============================================================================
# 3. 节点实现
# ============================================================================

# --- 新增：Router 节点 (网关) ---
async def router_node(state: AgentState) -> Dict[str, Any]:
    """[网关] 只负责分类，不负责回答"""
    messages = state["messages"]

    # 断点恢复检查
    if state.get("task_list") and len(state.get("task_list", [])) > 0:
        return {"router_decision": "complex"}

    parser = PydanticOutputParser(pydantic_object=RoutingDecision)
    try:
        # 🔥 关键：静态 SystemPrompt + 动态 Messages
        response = await llm.ainvoke(
            [
                SystemMessage(content=ROUTER_SYSTEM_PROMPT),
                *messages  # 用户的输入在这里
            ],
            config={"tags": ["router"]}
        )
        decision = parser.parse(response.content)
        return {"router_decision": decision.decision_type}
    except Exception as e:
        print(f"[ROUTER ERROR] {e}")
        return {"router_decision": "complex"}

# --- 新增：Direct Reply 节点 (Simple 模式流式回答) ---
async def direct_reply_node(state: AgentState) -> Dict[str, Any]:
    """[直连节点] 负责 Simple 模式下的流式回复"""
    print(f"[DIRECT_REPLY] 节点开始执行")
    messages = state["messages"]

    # 使用流式配置，添加 metadata 便于追踪
    config = {"tags": ["direct_reply"], "metadata": {"node_type": "direct_reply"}}
    
    # 直接调用 LLM 生成回复 (这才是真正的流式)
    response = await llm.ainvoke(
        [
            SystemMessage(content=DEFAULT_ASSISTANT_PROMPT),
            *messages  # 用户的历史消息上下文
        ],
        config=config
    )

    print(f"[DIRECT_REPLY] 节点完成，回复长度: {len(response.content)}")

    # 直接返回 response 对象（保留完整元数据），并添加 final_response 字段
    return {
        "messages": [response],
        "final_response": response.content
    }

# --- 修改：Planner 节点 (原 Commander) ---
async def planner_node(state: AgentState) -> Dict[str, Any]:
    """
    [架构师] 将复杂查询拆解为子任务。
    仅当 Router 决定 intent="complex" 时触发。
    """
    messages = state["messages"]
    last_message = messages[-1]
    user_query = last_message.content if isinstance(last_message, HumanMessage) else str(last_message.content)
    
    # 加载配置 (数据库或回退)
    # 注意：为了兼容性，我们仍然读取 key="commander" 的配置
    commander_config = get_expert_config_cached("commander") 
    
    if not commander_config:
        system_prompt = PLANNER_SYSTEM_PROMPT
        model = model_name  # 👈 使用与 Router 相同的模型（从环境变量读取）
        temperature = 0.5
        print(f"[PLANNER] 使用默认回退配置: model={model}")
    else:
        system_prompt = commander_config["system_prompt"]
        model = commander_config["model"]
        temperature = commander_config["temperature"]
        print(f"[PLANNER] 加载数据库配置: model={model}")
    
    # 执行 LLM 进行规划
    try:
        llm_with_config = llm.bind(model=model, temperature=temperature)
        
        # 👈 添加 RunnableConfig 标签，便于流式输出过滤
        from langchain_core.runnables import RunnableConfig
        response = await llm_with_config.ainvoke(
            [
                SystemMessage(content=system_prompt),
                HumanMessage(content=f"用户查询: {user_query}\n\n请将此查询拆解为子任务列表。")
            ],
            config=RunnableConfig(
                tags=["commander", "planner"],
                metadata={"node_type": "planner"}
            )
        )

        # 解析 JSON
        planner_response = parse_llm_json(
            response.content,
            PlannerOutput, # 使用新的 Pydantic 模型名
            strict=False,
            clean_markdown=True
        )

        # 转换为内部字典格式
        task_list = [
            {
                "id": str(uuid4()),
                "expert_type": task.expert_type,
                "description": task.description,
                "input_data": task.input_data,
                "priority": task.priority,
                "status": "pending",
                "output_result": None,
                "started_at": None,
                "completed_at": None,
                "created_at": datetime.now().isoformat(),
                "updated_at": datetime.now().isoformat()
            }
            for task in planner_response.tasks
        ]

        print(f"[PLANNER] 生成了 {len(task_list)} 个任务。策略: {planner_response.strategy}")

        return {
            "task_list": task_list,
            "strategy": planner_response.strategy,
            "current_task_index": 0,
            "expert_results": [],
            # 前端用于 UI 渲染的元数据
            "__task_plan": {
                "task_count": len(task_list),
                "strategy": planner_response.strategy,
                "estimated_steps": planner_response.estimated_steps,
                "tasks": task_list
            }
        }

    except Exception as e:
        print(f"[ERROR] Planner 规划失败: {e}")
        return {
            "task_list": [],
            "strategy": f"Error: {str(e)}",
            "current_task_index": 0
        }

# --- 原有：Expert Dispatcher 节点 (逻辑不变) ---
async def expert_dispatcher_node(state: AgentState) -> Dict[str, Any]:
    task_list = state["task_list"]
    current_index = state["current_task_index"]

    if current_index >= len(task_list):
        return {"expert_results": state["expert_results"]}

    current_task = task_list[current_index]
    expert_type = current_task["expert_type"]
    description = current_task["description"]

    print(f"[EXEC] 执行任务 [{current_index + 1}/{len(task_list)}] - {expert_type}: {description}")

    try:
        expert_func = DYNAMIC_EXPERT_FUNCTIONS.get(expert_type)
        if not expert_func:
            raise ValueError(f"未知的专家类型: {expert_type}")

        result = await expert_func(state, llm)

        if "error" in result:
             raise AppError(message=result["error"], code="EXPERT_EXECUTION_ERROR")

        # 更新任务状态
        current_task["output_result"] = {"content": result.get("output_result", "")}
        current_task["status"] = result.get("status", "completed")
        current_task["completed_at"] = result.get("completed_at")
        
        # 添加到结果集
        updated_results = state["expert_results"] + [{
            "task_id": current_task["id"],
            "expert_type": expert_type,
            "description": description,
            "output": result.get("output_result", ""),
            "status": result.get("status", "unknown"),
            "duration_ms": result.get("duration_ms", 0)
        }]

        duration = result.get('duration_ms', 0) / 1000
        print(f"   [OK] 耗时 {duration:.2f}s")

        duration_ms = result.get('duration_ms', 0)
        return_dict = {
            "task_list": task_list,
            "expert_results": updated_results,
            "current_task_index": current_index + 1,
            "__expert_info": { # 用于前端 SSE 事件
                "expert_type": expert_type,
                "description": description,
                "status": "completed",
                "output": result.get("output_result", ""),
                "duration_ms": duration_ms,
            }
        }
        if "artifact" in result:
            return_dict["artifact"] = result["artifact"]

        return return_dict

    except Exception as e:
        print(f"   [ERROR] 专家执行失败: {e}")
        current_task["status"] = "failed"
        return {
            "task_list": task_list,
            "current_task_index": current_index + 1,
            "__expert_info": {
                "expert_type": expert_type,
                "description": description,
                "status": "failed",
                "error": str(e),
                "duration_ms": 0,
            }
        }

# --- 原有：Aggregator 节点 (逻辑不变) ---
async def aggregator_node(state: AgentState) -> Dict[str, Any]:
    expert_results = state["expert_results"]
    strategy = state["strategy"]

    if not expert_results:
        return {"final_response": "未生成任何执行结果。"}

    print(f"[AGG] 正在聚合 {len(expert_results)} 个结果...")
    final_response = _build_markdown_response(expert_results, strategy)
    return {"final_response": final_response}

def _build_markdown_response(expert_results: List[Dict[str, Any]], strategy: str) -> str:
    # 简单的 Markdown 构建逻辑
    lines = [f"# 执行报告\n**策略**: {strategy}\n---"]
    for i, res in enumerate(expert_results, 1):
        lines.append(f"## {i}. {res['expert_type'].upper()}: {res['description']}")
        lines.append(f"{res['output']}\n")
    return "\n".join(lines)

# ============================================================================
# 4. 条件路由逻辑 (Edges)
# ============================================================================

def route_router(state: AgentState) -> str:
    """Router 之后的去向"""
    decision = state.get("router_decision", "complex")

    print(f"[ROUTE_ROUTER] 决策: {decision}, 将路由到: {'direct_reply' if decision == 'simple' else 'planner'}")

    if decision == "simple":
        # Simple 模式进入 direct_reply 节点
        return "direct_reply"
    else:
        # Complex 模式进入规划器
        return "planner"

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
    workflow.add_node("planner", planner_node)
    workflow.add_node("expert_dispatcher", expert_dispatcher_node)
    workflow.add_node("aggregator", aggregator_node)

    # 设置入口：现在入口是 Router！
    workflow.set_entry_point("router")

    # 添加连线

    # 1. Router -> (Direct Reply | Planner)
    workflow.add_conditional_edges(
        "router",
        route_router,
        {
            "direct_reply": "direct_reply",
            "planner": "planner"
        }
    )

    # 2. Direct Reply -> END
    workflow.add_edge("direct_reply", END)

    # 2. Planner -> Dispatcher (规划完必然执行)
    workflow.add_edge("planner", "expert_dispatcher")

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

async def execute_commander_workflow(user_query: str) -> Dict[str, Any]:
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