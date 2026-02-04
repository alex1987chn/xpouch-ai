"""
XPouch AI 智能路由工作流 (v3.0 架构)
集成意图识别 (Router) -> 任务指挥官 (Commander) -> 专家执行 (Experts)
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
from pydantic import BaseModel, Field, field_validator
from uuid import uuid4
from datetime import datetime

# 导入数据模型
import sys
sys.path.append(str(pathlib.Path(__file__).parent.parent))
from models import ExpertType, TaskStatus, SubTask, TaskSession, Message as MessageModel
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
    update_task_session_status,
    get_task_session_by_thread
)
from constants import COMMANDER_SYSTEM_PROMPT, COMMANDER_SYSTEM_PROMPT_TEMPLATE, ROUTER_SYSTEM_PROMPT, DEFAULT_ASSISTANT_PROMPT 
from agents.dynamic_experts import DYNAMIC_EXPERT_FUNCTIONS, initialize_expert_cache, get_all_expert_list, format_expert_list_for_prompt, get_expert_function
from agents.expert_loader import get_expert_config_cached

# ============================================================================
# 0. 设置与配置
# ============================================================================
# 从工厂函数导入 LLM 实例创建器
from utils.llm_factory import get_router_llm, get_commander_llm, get_llm_instance, get_expert_llm, get_aggregator_llm

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
        _router_llm = get_router_llm()
    return _router_llm

def get_commander_llm_lazy():
    """延迟初始化 Commander LLM"""
    global _commander_llm
    if _commander_llm is None:
        _commander_llm = get_commander_llm()
    return _commander_llm

def get_simple_llm_lazy():
    """延迟初始化 Simple 模式 LLM"""
    global _simple_llm
    if _simple_llm is None:
        from providers_config import is_provider_configured
        try:
            if is_provider_configured('minimax'):
                _simple_llm = get_llm_instance(provider='minimax', streaming=True, temperature=0.7)
                print("[LLM] Simple 模式使用: MiniMax-M2.1")
            else:
                _simple_llm = get_router_llm_lazy()
                print("[LLM] Simple 模式回退到 Router LLM")
        except Exception as e:
            print(f"[LLM] Simple 模式初始化失败，回退到 Router: {e}")
            _simple_llm = get_router_llm_lazy()
    return _simple_llm

# 为了保持向后兼容，保留全局变量名作为函数别名
router_llm = None  # 标记为废弃，使用 get_router_llm_lazy()
commander_llm = None
simple_llm = None

# 全局事件生成器（用于生成 SSE 事件）
event_gen = EventGenerator()

# ============================================================================
# 1. 结构定义与提示词 (新的 Router 逻辑)
# ============================================================================
# ROUTER_SYSTEM_PROMPT 已从 constants.py 导入

class RoutingDecision(BaseModel):
    """v2.7 网关决策结构（Router只负责分类）"""
    decision_type: Literal["simple", "complex"] = Field(description="决策类型")

# --- 保留原有的指挥官结构 ---

class SubTaskOutput(BaseModel):
    """单个子任务结构 (Commander 使用)
    
    支持显式依赖关系 (DAG)，通过 id 和 depends_on 实现精准数据管道
    """
    id: str = Field(default="", description="任务唯一标识符（短ID，如 task_1, task_2）")
    expert_type: str = Field(description="执行此任务的专家类型（可以是系统内置专家或自定义专家）")
    description: str = Field(description="任务描述")
    input_data: Dict[str, Any] = Field(default={}, description="输入参数")
    priority: int = Field(default=0, description="优先级 (0=最高)")
    depends_on: List[str] = Field(default=[], description="依赖的任务ID列表。如果任务B需要任务A的输出，则填入 ['task_a']")
    
    @field_validator('depends_on', mode='before')
    @classmethod
    def parse_depends_on(cls, v):
        """
        兼容处理：如果 LLM 返回了整数依赖（如 [0]），强制转为字符串 ["0"]
        """
        if v is None:
            return []
        
        # 情况 1: LLM 发疯返了个单个 int/str (不是列表)
        if isinstance(v, (int, str)):
            return [str(v)]
            
        # 情况 2: 正常的列表，但里面混了 int
        if isinstance(v, list):
            return [str(item) for item in v]
            
        return v

class CommanderOutput(BaseModel):
    """指挥官输出 - 子任务列表"""
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
        response = await get_router_llm_lazy().ainvoke(
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
    
    # Simple 模式使用 MiniMax（响应最快）
    response = await get_simple_llm_lazy().ainvoke(
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

# --- 指挥官节点 ---
async def commander_node(state: AgentState) -> Dict[str, Any]:
    """
    [指挥官] 将复杂查询拆解为子任务。
    v3.0 更新：立即持久化到数据库，发送 plan.created 事件
    """
    messages = state["messages"]
    last_message = messages[-1]
    user_query = last_message.content if isinstance(last_message, HumanMessage) else str(last_message.content)
    
    # 获取数据库会话和 thread_id
    db_session = state.get("db_session")
    thread_id = state.get("thread_id")
    
    # 加载配置 (数据库或回退)
    # v3.0: 优先从数据库直接读取，确保获取最新配置（包括动态占位符）
    commander_config = None
    if db_session:
        from agents.expert_loader import get_expert_config
        commander_config = get_expert_config("commander", db_session)
        if commander_config:
            print(f"[COMMANDER] 从数据库直接加载配置: model={commander_config['model']}")
    
    # 如果数据库读取失败，回退到缓存
    if not commander_config:
        commander_config = get_expert_config_cached("commander")
    
    if not commander_config:
        # 回退：使用常量中的 Prompt 和硬编码的模型
        system_prompt = COMMANDER_SYSTEM_PROMPT
        model = os.getenv("MODEL_NAME", "deepseek-chat")
        temperature = 0.5
        print(f"[COMMANDER] 使用默认回退配置: model={model}")
    else:
        # 使用数据库配置
        system_prompt = commander_config["system_prompt"]
        model = commander_config["model"]
        temperature = commander_config["temperature"]
        print(f"[COMMANDER] 加载配置: model={model}, temperature={temperature}")
    
    # 注入动态专家列表到 System Prompt
    try:
        # 获取所有可用专家（包括动态创建的专家）
        all_experts = get_all_expert_list(db_session)
        expert_list_str = format_expert_list_for_prompt(all_experts)
        
        # 尝试注入专家列表到 Prompt（如果 Prompt 支持动态占位符）
        if "{dynamic_expert_list}" in system_prompt:
            system_prompt = system_prompt.format(dynamic_expert_list=expert_list_str)
            print(f"[COMMANDER] 已注入动态专家列表，共 {len(all_experts)} 个专家")
        else:
            # 如果 Prompt 不包含占位符，保留原有逻辑（向后兼容）
            print(f"[COMMANDER] Prompt 不包含动态占位符，跳过专家列表注入")
    except Exception as e:
        # 注入失败时不中断流程，保留原始 Prompt
        print(f"[COMMANDER] 专家列表注入失败（已忽略）: {e}")
    
    # 执行 LLM 进行规划
    try:
        # 从模型名称推断 provider
        from providers_config import get_model_config
        from utils.llm_factory import get_llm_instance

        model_config = get_model_config(model)

        if model_config and 'provider' in model_config:
            # 使用推断出的 provider 创建 LLM
            provider = model_config['provider']
            # 优先使用模型配置中的 temperature（如果有）
            final_temperature = model_config.get('temperature', temperature)
            # 获取实际的 API 模型名称（providers.yaml 中定义的 model 字段）
            actual_model = model_config.get('model', model)
            llm = get_llm_instance(
                provider=provider,
                streaming=True,
                temperature=final_temperature
            )
            print(f"[COMMANDER] 模型 '{model}' -> '{actual_model}' 使用 provider: {provider}, temperature: {final_temperature}")
            llm_with_config = llm.bind(model=actual_model, temperature=final_temperature)
        else:
            # 回退到 commander_llm（硬编码的 provider 优先级）
            print(f"[COMMANDER] 模型 '{model}' 未找到 provider 配置，回退到 commander_llm")
            llm_with_config = get_commander_llm_lazy().bind(model=model, temperature=temperature)

        from langchain_core.runnables import RunnableConfig
        response = await llm_with_config.ainvoke(
            [
                SystemMessage(content=system_prompt),
                HumanMessage(content=f"用户查询: {user_query}\n\n请将此查询拆解为子任务列表。")
            ],
            config=RunnableConfig(
                tags=["commander"],
                metadata={"node_type": "commander"}
            )
        )

        # 解析 JSON
        commander_response = parse_llm_json(
            response.content,
            CommanderOutput,
            strict=False,
            clean_markdown=True
        )

        # v3.1: 兜底处理 - 如果 LLM 没有生成 id，自动生成
        for idx, task in enumerate(commander_response.tasks):
            if not task.id:
                task.id = f"task_{idx}"
                print(f"[COMMANDER] 自动为任务 {idx} 生成 id: {task.id}")
        
        # v3.2: 修复依赖上下文注入 - 将 depends_on 中的索引格式转换为 ID 格式
        # LLM 可能生成 ["0"]（索引），需要转换为 ["task_0"]（ID）
        task_id_map = {str(idx): task.id for idx, task in enumerate(commander_response.tasks)}
        for task in commander_response.tasks:
            if task.depends_on:
                new_depends_on = []
                for dep in task.depends_on:
                    # 如果是数字索引（如 "0"），转换为对应的 ID（如 "task_0"）
                    if dep in task_id_map:
                        new_depends_on.append(task_id_map[dep])
                    else:
                        # 如果已经是正确的 ID 格式（如 "task_0"），保持不变
                        new_depends_on.append(dep)
                task.depends_on = new_depends_on
                print(f"[COMMANDER] 任务 {task.id} 的依赖已转换: {new_depends_on}")

        # v3.0: 准备子任务数据（支持显式依赖关系 DAG）
        from models import SubTaskCreate
        subtasks_data = [
            SubTaskCreate(
                expert_type=task.expert_type,
                task_description=task.description,
                input_data=task.input_data,
                sort_order=idx,
                execution_mode="sequential",  # 默认串行，可扩展为并行
                depends_on=task.depends_on if task.depends_on else None
            )
            for idx, task in enumerate(commander_response.tasks)
        ]
        
        # 建立 task_id -> database_id 的映射（用于后续依赖注入）
        task_id_mapping = {
            task.id: idx for idx, task in enumerate(commander_response.tasks)
        }

        # v3.0: 立即持久化到数据库
        task_session = None
        if db_session and thread_id:
            # v3.1: 先检查 Router 是否已创建 TaskSession（避免重复创建）
            existing_session = get_task_session_by_thread(db_session, thread_id)
            if existing_session:
                task_session = existing_session
                print(f"[COMMANDER] 复用 Router 创建的 TaskSession: {task_session.session_id}")
                # 更新已有 session 的信息
                task_session.plan_summary = commander_response.strategy
                task_session.estimated_steps = commander_response.estimated_steps
                task_session.execution_mode = "sequential"
                db_session.add(task_session)
                # 创建 SubTask 并关联到已有 session
                from crud.task_session import create_subtask
                for subtask_data in subtasks_data:
                    create_subtask(
                        db=db_session,
                        task_session_id=task_session.session_id,
                        expert_type=subtask_data.expert_type,
                        task_description=subtask_data.task_description,
                        sort_order=subtask_data.sort_order,
                        input_data=subtask_data.input_data,
                        execution_mode=subtask_data.execution_mode,
                        depends_on=subtask_data.depends_on
                    )
                db_session.commit()
                db_session.refresh(task_session)
            else:
                # 创建新的 TaskSession
                task_session = create_task_session_with_subtasks(
                    db=db_session,
                    thread_id=thread_id,
                    user_query=user_query,
                    plan_summary=commander_response.strategy,
                    estimated_steps=commander_response.estimated_steps,
                    subtasks_data=subtasks_data,
                    execution_mode="sequential"
                )
                print(f"[COMMANDER] 任务会话已创建: {task_session.session_id}")

        # 转换为内部字典格式（用于 LangGraph 状态流转）
        # v3.1: 支持显式依赖关系，包含 task_id（Commander 生成）和 depends_on
        sub_tasks_list = task_session.sub_tasks if task_session else []
        task_list = []
        for idx, subtask in enumerate(sub_tasks_list):
            commander_task = commander_response.tasks[idx]
            task_list.append({
                "id": subtask.id,  # 数据库生成的 UUID
                "task_id": commander_task.id,  # Commander 生成的短ID（如 task_search）
                "expert_type": subtask.expert_type,
                "description": subtask.task_description,
                "input_data": subtask.input_data,
                "sort_order": subtask.sort_order,
                "status": subtask.status,
                "depends_on": commander_task.depends_on if commander_task.depends_on else [],
                "output_result": None,
                "started_at": None,
                "completed_at": None
            })

        print(f"[COMMANDER] 生成了 {len(task_list)} 个任务。策略: {commander_response.strategy}")

        # v3.0: 构建事件队列
        event_queue = []
        
        # 发送 plan.created 事件
        if task_session:
            plan_event = event_plan_created(
                session_id=task_session.session_id,
                summary=commander_response.strategy,
                estimated_steps=commander_response.estimated_steps,
                execution_mode="sequential",
                tasks=[
                    {
                        "id": t.id,
                        "task_id": commander_response.tasks[idx].id,
                        "expert_type": t.expert_type,
                        "description": t.task_description,
                        "sort_order": t.sort_order,
                        "status": t.status,
                        "depends_on": commander_response.tasks[idx].depends_on if commander_response.tasks[idx].depends_on else []
                    }
                    for idx, t in enumerate(task_session.sub_tasks)
                ]
            )
            event_queue.append({"type": "sse", "event": sse_event_to_string(plan_event)})

        return {
            "task_list": task_list,
            "strategy": commander_response.strategy,
            "current_task_index": 0,
            "expert_results": [],
            "task_session_id": task_session.session_id if task_session else None,
            "event_queue": event_queue,
            # 保留前端兼容的元数据
            "__task_plan": {
                "task_count": len(task_list),
                "strategy": commander_response.strategy,
                "estimated_steps": commander_response.estimated_steps,
                "tasks": task_list
            }
        }

    except Exception as e:
        print(f"[ERROR] Commander 规划失败: {e}")
        import traceback
        traceback.print_exc()
        return {
            "task_list": [],
            "strategy": f"Error: {str(e)}",
            "current_task_index": 0,
            "event_queue": []
        }

# --- v3.1: Expert Dispatcher 节点（支持显式依赖注入和上下文传递）---
async def expert_dispatcher_node(state: AgentState) -> Dict[str, Any]:
    """
    专家分发器节点
    v3.1 更新：支持显式依赖关系（DAG），自动注入前置任务输出到上下文
    """
    task_list = state["task_list"]
    current_index = state["current_task_index"]
    expert_results = state.get("expert_results", [])
    
    # 获取数据库会话
    db_session = state.get("db_session")
    task_session_id = state.get("task_session_id")
    
    # 收集事件队列
    event_queue = state.get("event_queue", [])

    if current_index >= len(task_list):
        return {"expert_results": expert_results, "event_queue": event_queue}

    current_task = task_list[current_index]
    task_id = current_task["id"]
    task_short_id = current_task.get("task_id", f"task_{current_index}")  # Commander 生成的短ID
    expert_type = current_task["expert_type"]
    description = current_task["description"]
    depends_on = current_task.get("depends_on", [])

    print(f"[EXEC] 执行任务 [{current_index + 1}/{len(task_list)}] - {expert_type}: {description}")
    
    # v3.1: 依赖检查和上下文注入
    dependency_context = ""
    dependency_outputs = []
    if depends_on:
        # 构建 task_short_id -> result 的映射
        task_result_map = {}
        for result in expert_results:
            short_id = result.get("task_short_id")
            if short_id:
                task_result_map[short_id] = result
        
        # 调试日志
        print(f"[DEBUG] depends_on: {depends_on}")
        print(f"[DEBUG] task_result_map keys: {list(task_result_map.keys())}")
        print(f"[DEBUG] expert_results count: {len(expert_results)}")
        
        # 收集依赖任务的输出
        for dep_task_id in depends_on:
            if dep_task_id in task_result_map:
                dep_result = task_result_map[dep_task_id]
                dependency_outputs.append({
                    "task_id": dep_task_id,
                    "expert_type": dep_result["expert_type"],
                    "description": dep_result["description"],
                    "output": dep_result["output"]
                })
                print(f"[DEBUG] 找到依赖任务 {dep_task_id}: {dep_result['expert_type']}")
            else:
                print(f"[WARN] 依赖任务 {dep_task_id} 的输出尚未就绪")
        
        if dependency_outputs:
            # 格式化依赖上下文
            dependency_parts = []
            for dep in dependency_outputs:
                output_preview = dep['output'][:500] + "..." if len(dep['output']) > 500 else dep['output']
                dep_str = f"【前置任务: {dep['task_id']} ({dep['expert_type']})】\n描述: {dep['description']}\n输出:\n{output_preview}"
                dependency_parts.append(dep_str)
            
            dependency_context = "\n\n".join(dependency_parts)
            print(f"[DEP] 已注入 {len(dependency_outputs)} 个依赖任务的上下文")
    
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
        # 使用 get_expert_function 获取专家执行函数
        expert_func = get_expert_function(expert_type)

        # v3.1: 准备带依赖上下文的 state
        # 将依赖上下文注入到 current_task 的 input_data 中
        enhanced_input_data = current_task.get("input_data", {}).copy()
        if dependency_context:
            enhanced_input_data["__dependency_context"] = dependency_context
            # 同时保存结构化的依赖数据供专家使用
            enhanced_input_data["__dependencies"] = [
                {
                    "task_id": dep["task_id"],
                    "expert_type": dep["expert_type"],
                    "output": dep["output"]
                }
                for dep in dependency_outputs
            ]
        
        # 创建增强的 state，注入依赖上下文
        enhanced_task = current_task.copy()
        enhanced_task["input_data"] = enhanced_input_data
        
        # 临时替换 state 中的 current_task
        original_task_list = task_list.copy()
        task_list[current_index] = enhanced_task
        
        # v3.2: 创建增强的 state，确保专家能获取到依赖上下文
        enhanced_state = state.copy()
        enhanced_state["task_list"] = task_list.copy()

        if expert_type in DYNAMIC_EXPERT_FUNCTIONS:
            # 系统内置专家，使用原有逻辑（预先创建 LLM）
            expert_config = get_expert_config_cached(expert_type)
            if expert_config and 'provider' in expert_config:
                expert_llm = get_expert_llm(provider=expert_config['provider'])
            else:
                expert_llm = get_expert_llm()
            result = await expert_func(enhanced_state, expert_llm)
        else:
            # 自定义专家，使用通用节点（generic_worker_node 自己会创建 LLM）
            result = await expert_func(enhanced_state)
        
        # 恢复原 task_list（避免污染 state）
        task_list[current_index] = original_task_list[current_index]

        if "error" in result:
             raise AppError(message=result["error"], code="EXPERT_EXECUTION_ERROR")

        # 更新任务状态
        current_task["output_result"] = {"content": result.get("output_result", "")}
        current_task["status"] = result.get("status", "completed")
        current_task["completed_at"] = result.get("completed_at")
        
        # 添加到结果集（v3.1: 包含 task_short_id 用于依赖查找）
        updated_results = state["expert_results"] + [{
            "task_id": current_task["id"],  # 数据库 UUID
            "task_short_id": task_short_id,  # Commander 生成的短 ID (如 task_search)
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

# --- v3.1: Aggregator 节点（调用 LLM 生成自然语言总结）---
async def aggregator_node(state: AgentState) -> Dict[str, Any]:
    """
    聚合器节点
    v3.1 更新：调用 LLM 生成自然语言总结，支持流式输出
    """
    expert_results = state["expert_results"]
    strategy = state["strategy"]

    # 获取数据库会话
    db_session = state.get("db_session")
    task_session_id = state.get("task_session_id")
    event_queue = state.get("event_queue", [])
    # v3.0: 获取前端传递的 message_id（如果有的话）
    # 注意：Message.id 在数据库中是 INTEGER 类型，不能直接使用 UUID
    # 所以 message_id 只用于 SSE 事件标识，不用于数据库存储
    message_id = state.get("message_id", str(uuid4()))

    if not expert_results:
        return {"final_response": "未生成任何执行结果。", "event_queue": event_queue}

    print(f"[AGG] 正在聚合 {len(expert_results)} 个结果，调用 LLM 生成总结...")

    # v3.1: 构建 Aggregator 的 Prompt
    aggregator_prompt = _build_aggregator_prompt(expert_results, strategy)
    
    # v3.1: 获取 Aggregator LLM（带兜底逻辑）
    aggregator_llm = get_aggregator_llm()
    
    # v3.1: 流式生成总结
    final_response_chunks = []
    
    try:
        # 使用流式输出
        async for chunk in aggregator_llm.astream([
            SystemMessage(content="你是一个专业的报告撰写专家。你的任务是将多个专家的分析结果整合成一份连贯、专业的最终报告。不要简单罗列，要用自然流畅的语言进行总结。"),
            HumanMessage(content=aggregator_prompt)
        ]):
            content = chunk.content if hasattr(chunk, 'content') else str(chunk)
            if content:
                final_response_chunks.append(content)
                
                # 发送 message.delta 事件（实时流式）
                delta_event = event_message_delta(
                    message_id=message_id,
                    content=content,
                    is_final=False
                )
                event_queue.append({"type": "sse", "event": sse_event_to_string(delta_event)})
        
        final_response = "".join(final_response_chunks)
        
    except Exception as e:
        print(f"[AGG] LLM 总结失败，回退到简单拼接: {e}")
        # 兜底：使用简单拼接
        final_response = _build_markdown_response(expert_results, strategy)
        
        # 发送简单拼接的结果
        chunk_size = 100
        for i in range(0, len(final_response), chunk_size):
            chunk = final_response[i:i + chunk_size]
            is_final = (i + chunk_size) >= len(final_response)
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
        
        # 🔥🔥🔥 关键修复：持久化聚合消息到数据库 🔥🔥🔥
        # 只有存进去了，下次刷新 GET /messages 才能看到它
        conversation_id = state.get("thread_id")  # v3.2: 使用 thread_id 作为 conversation_id
        if conversation_id:
            # 创建消息记录（关联 conversation_id）
            # 注意：不手动指定 id，让数据库自动生成（id 是 INTEGER 自增）
            # message_id 只用于 SSE 事件标识
            # 注意：Message 模型暂时没有 task_session_id 字段，以后可能需要添加
            message_record = MessageModel(
                thread_id=conversation_id,
                role="assistant",
                content=final_response
            )
            db_session.add(message_record)
            db_session.commit()
            print(f"[AGG] 聚合消息已持久化到数据库，conversation_id={conversation_id}")
    
    print(f"[AGG] 聚合完成，回复长度: {len(final_response)}")

    return {
        "final_response": final_response,
        "event_queue": event_queue
    }


def _build_aggregator_prompt(expert_results: List[Dict[str, Any]], strategy: str) -> str:
    """
    构建 Aggregator 的 Prompt，将多个专家结果转换为自然语言总结的输入
    
    Args:
        expert_results: 专家执行结果列表
        strategy: 执行策略概述
        
    Returns:
        str: 供 LLM 总结的 Prompt
    """
    lines = [
        f"执行策略: {strategy}",
        "",
        "各专家分析结果如下：",
        ""
    ]
    
    for i, res in enumerate(expert_results, 1):
        lines.append(f"【专家 {i}: {res['expert_type'].upper()}】")
        lines.append(f"任务描述: {res['description']}")
        lines.append(f"分析结果:\n{res['output']}")
        lines.append("")
    
    lines.extend([
        "---",
        "",
        "请基于以上各专家的分析结果，撰写一份连贯、专业的最终总结报告。要求：",
        "1. 用自然流畅的语言整合所有专家的观点，不要简单罗列",
        "2. 突出关键发现和核心结论",
        "3. 保持逻辑清晰，结构完整",
        "4. 如果专家结果之间有依赖关系，请体现这种关联",
        ""
    ])
    
    return "\n".join(lines)

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