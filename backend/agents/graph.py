"""
XPouch AI 智能路由工作流 (v3.0 架构)
集成意图识别 (Router) -> 任务规划 (Planner) -> 专家执行 (Experts)
支持事件溯源持久化和 Server-Driven UI
"""
from typing import TypedDict, Annotated, List, Dict, Any, Literal, Optional, AsyncGenerator
from langgraph.graph import StateGraph, END, START
from langgraph.graph.message import add_messages
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
from models import ExpertType, TaskStatus, SubTask, TaskSession
from config import init_langchain_tracing, get_langsmith_config
from utils.json_parser import parse_llm_json
from utils.exceptions import AppError
from utils.event_generator import (
    EventGenerator,
    event_plan_created, event_task_started, event_task_completed, event_task_failed,
    event_artifact_generated, event_message_delta, event_message_done,
    sse_event_to_string
)
from crud.task_session import (
    create_task_session_with_subtasks,
    update_subtask_status,
    create_artifacts_batch,
    update_task_session_status
)
# 将原有的 COMMANDER_SYSTEM_PROMPT 作为规划器 (Planner) 的提示词
from constants import COMMANDER_SYSTEM_PROMPT as PLANNER_SYSTEM_PROMPT, ROUTER_SYSTEM_PROMPT, DEFAULT_ASSISTANT_PROMPT 
from agents.dynamic_experts import DYNAMIC_EXPERT_FUNCTIONS, initialize_expert_cache
from agents.expert_loader import get_expert_config_cached

# ============================================================================
# 0. 设置与配置
# ============================================================================
# 从工厂函数导入 LLM 实例创建器
from utils.llm_factory import get_router_llm, get_planner_llm, get_expert_llm

# LangSmith 链路追踪
env_path = pathlib.Path(__file__).parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

langsmith_config = get_langsmith_config()
if langsmith_config["enabled"]:
    init_langchain_tracing(langsmith_config)

# 初始化 LLM - 使用工厂函数
# Router 使用较低温度以获得更确定的输出
llm = get_router_llm()

# 全局事件生成器（用于生成 SSE 事件）
event_gen = EventGenerator()

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
    # 记录路由决策信息
    router_decision: str
    # v3.0 新增：数据库持久化相关
    thread_id: Optional[str]           # 关联的对话ID
    task_session_id: Optional[str]     # 任务会话ID
    db_session: Optional[Any]          # 数据库会话（用于节点内持久化）
    # v3.0 新增：事件队列（用于 SSE 推送）
    event_queue: List[Dict[str, Any]]  # 待发送的事件列表 

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
    v3.0 更新：立即持久化到数据库，发送 plan.created 事件
    """
    messages = state["messages"]
    last_message = messages[-1]
    user_query = last_message.content if isinstance(last_message, HumanMessage) else str(last_message.content)
    
    # 获取数据库会话和 thread_id
    db_session = state.get("db_session")
    thread_id = state.get("thread_id")
    
    # 加载配置 (数据库或回退)
    commander_config = get_expert_config_cached("commander") 
    
    if not commander_config:
        system_prompt = PLANNER_SYSTEM_PROMPT
        model = os.getenv("MODEL_NAME", "deepseek-chat")
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
            PlannerOutput,
            strict=False,
            clean_markdown=True
        )

        # v3.0: 准备子任务数据
        from models import SubTaskCreate
        subtasks_data = [
            SubTaskCreate(
                expert_type=task.expert_type,
                task_description=task.description,
                input_data=task.input_data,
                sort_order=idx,
                execution_mode="sequential"  # 默认串行，可扩展为并行
            )
            for idx, task in enumerate(planner_response.tasks)
        ]

        # v3.0: 立即持久化到数据库
        task_session = None
        if db_session and thread_id:
            task_session = create_task_session_with_subtasks(
                db=db_session,
                thread_id=thread_id,
                user_query=user_query,
                plan_summary=planner_response.strategy,
                estimated_steps=planner_response.estimated_steps,
                subtasks_data=subtasks_data,
                execution_mode="sequential"
            )
            print(f"[PLANNER] 任务会话已创建: {task_session.session_id}")

        # 转换为内部字典格式（用于 LangGraph 状态流转）
        task_list = [
            {
                "id": subtask.id,
                "expert_type": subtask.expert_type,
                "description": subtask.task_description,
                "input_data": subtask.input_data,
                "sort_order": subtask.sort_order,
                "status": subtask.status,
                "output_result": None,
                "started_at": None,
                "completed_at": None
            }
            for subtask in task_session.sub_tasks if task_session else []
        ]

        print(f"[PLANNER] 生成了 {len(task_list)} 个任务。策略: {planner_response.strategy}")

        # v3.0: 构建事件队列
        event_queue = []
        
        # 发送 plan.created 事件
        if task_session:
            plan_event = event_plan_created(
                session_id=task_session.session_id,
                summary=planner_response.strategy,
                estimated_steps=planner_response.estimated_steps,
                execution_mode="sequential",
                tasks=[
                    {
                        "id": t.id,
                        "expert_type": t.expert_type,
                        "description": t.task_description,
                        "sort_order": t.sort_order,
                        "status": t.status
                    }
                    for t in task_session.sub_tasks
                ]
            )
            event_queue.append({"type": "sse", "event": sse_event_to_string(plan_event)})

        return {
            "task_list": task_list,
            "strategy": planner_response.strategy,
            "current_task_index": 0,
            "expert_results": [],
            "task_session_id": task_session.session_id if task_session else None,
            "event_queue": event_queue,
            # 保留前端兼容的元数据
            "__task_plan": {
                "task_count": len(task_list),
                "strategy": planner_response.strategy,
                "estimated_steps": planner_response.estimated_steps,
                "tasks": task_list
            }
        }

    except Exception as e:
        print(f"[ERROR] Planner 规划失败: {e}")
        import traceback
        traceback.print_exc()
        return {
            "task_list": [],
            "strategy": f"Error: {str(e)}",
            "current_task_index": 0,
            "event_queue": []
        }

# --- v3.0: Expert Dispatcher 节点（支持持久化和事件发送）---
async def expert_dispatcher_node(state: AgentState) -> Dict[str, Any]:
    """
    专家分发器节点
    v3.0 更新：持久化状态变更，发送 task.started/completed/failed 事件
    """
    task_list = state["task_list"]
    current_index = state["current_task_index"]
    
    # 获取数据库会话
    db_session = state.get("db_session")
    task_session_id = state.get("task_session_id")
    
    # 收集事件队列
    event_queue = state.get("event_queue", [])

    if current_index >= len(task_list):
        return {"expert_results": state["expert_results"], "event_queue": event_queue}

    current_task = task_list[current_index]
    task_id = current_task["id"]
    expert_type = current_task["expert_type"]
    description = current_task["description"]

    print(f"[EXEC] 执行任务 [{current_index + 1}/{len(task_list)}] - {expert_type}: {description}")
    
    # v3.0: 更新数据库状态为 running
    if db_session:
        update_subtask_status(db_session, task_id, "running")
    
    # v3.0: 发送 task.started 事件
    started_event = event_task_started(
        task_id=task_id,
        expert_type=expert_type,
        description=description
    )
    event_queue.append({"type": "sse", "event": sse_event_to_string(started_event)})

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

        duration_ms = result.get('duration_ms', 0)
        duration = duration_ms / 1000
        print(f"   [OK] 耗时 {duration:.2f}s")
        
        # v3.0: 处理产物（Artifact）
        artifacts_data = result.get("artifacts", [])
        if not artifacts_data and result.get("artifact"):
            # 兼容旧格式
            artifacts_data = [result.get("artifact")]
        
        # v3.0: 保存产物到数据库
        artifact_count = 0
        if db_session and artifacts_data:
            from models import ArtifactCreate
            artifact_creates = [
                ArtifactCreate(
                    type=art.get("type", "text"),
                    title=art.get("title"),
                    content=art.get("content", ""),
                    language=art.get("language"),
                    sort_order=idx
                )
                for idx, art in enumerate(artifacts_data)
            ]
            created_artifacts = create_artifacts_batch(db_session, task_id, artifact_creates)
            artifact_count = len(created_artifacts)
            
            # 发送 artifact.generated 事件
            for art, created in zip(artifacts_data, created_artifacts):
                artifact_event = event_artifact_generated(
                    task_id=task_id,
                    expert_type=expert_type,
                    artifact_id=created.id,
                    artifact_type=created.type,
                    content=created.content,
                    title=created.title,
                    language=created.language,
                    sort_order=created.sort_order
                )
                event_queue.append({"type": "sse", "event": sse_event_to_string(artifact_event)})
        
        # v3.0: 更新数据库状态为 completed
        if db_session:
            update_subtask_status(
                db_session, 
                task_id, 
                "completed",
                output_result={"content": result.get("output_result", "")},
                duration_ms=duration_ms
            )
        
        # v3.0: 发送 task.completed 事件
        completed_event = event_task_completed(
            task_id=task_id,
            expert_type=expert_type,
            description=description,
            output=result.get("output_result", ""),
            duration_ms=duration_ms,
            artifact_count=artifact_count
        )
        event_queue.append({"type": "sse", "event": sse_event_to_string(completed_event)})

        return_dict = {
            "task_list": task_list,
            "expert_results": updated_results,
            "current_task_index": current_index + 1,
            "event_queue": event_queue,
            "__expert_info": { # 保留前端兼容
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
        
        # v3.0: 更新数据库状态为 failed
        if db_session:
            update_subtask_status(
                db_session,
                task_id,
                "failed",
                error_message=str(e)
            )
        
        # v3.0: 发送 task.failed 事件
        failed_event = event_task_failed(
            task_id=task_id,
            expert_type=expert_type,
            description=description,
            error=str(e)
        )
        event_queue.append({"type": "sse", "event": sse_event_to_string(failed_event)})
        
        return {
            "task_list": task_list,
            "current_task_index": current_index + 1,
            "event_queue": event_queue,
            "__expert_info": {
                "expert_type": expert_type,
                "description": description,
                "status": "failed",
                "error": str(e),
                "duration_ms": 0,
            }
        }

# --- v3.0: Aggregator 节点（支持流式输出和事件发送）---
async def aggregator_node(state: AgentState) -> Dict[str, Any]:
    """
    聚合器节点
    v3.0 更新：流式输出最终回复，发送 message.delta/done 事件
    """
    expert_results = state["expert_results"]
    strategy = state["strategy"]
    
    # 获取数据库会话
    db_session = state.get("db_session")
    task_session_id = state.get("task_session_id")
    event_queue = state.get("event_queue", [])

    if not expert_results:
        return {"final_response": "未生成任何执行结果。", "event_queue": event_queue}

    print(f"[AGG] 正在聚合 {len(expert_results)} 个结果...")
    
    # 构建最终回复（这里可以调用 LLM 生成更自然的总结）
    final_response = _build_markdown_response(expert_results, strategy)
    
    # v3.0: 模拟流式输出（将最终回复分块发送）
    message_id = str(uuid4())
    chunk_size = 50  # 每块字符数
    
    for i in range(0, len(final_response), chunk_size):
        chunk = final_response[i:i + chunk_size]
        is_final = (i + chunk_size) >= len(final_response)
        
        # 发送 message.delta 事件
        delta_event = event_message_delta(
            message_id=message_id,
            content=chunk,
            is_final=is_final
        )
        event_queue.append({"type": "sse", "event": sse_event_to_string(delta_event)})
    
    # 发送 message.done 事件
    done_event = event_message_done(
        message_id=message_id,
        full_content=final_response
    )
    event_queue.append({"type": "sse", "event": sse_event_to_string(done_event)})
    
    # v3.0: 更新任务会话状态为 completed
    if db_session and task_session_id:
        update_task_session_status(
            db_session,
            task_session_id,
            "completed",
            final_response=final_response
        )
    
    print(f"[AGG] 聚合完成，回复长度: {len(final_response)}")

    return {
        "final_response": final_response,
        "event_queue": event_queue
    }

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