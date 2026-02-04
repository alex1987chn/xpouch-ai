"""
Commander 节点 - 任务规划

将复杂查询拆解为子任务，支持显式依赖关系（DAG）
"""
import os
from typing import Dict, Any, List
from datetime import datetime
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_core.runnables import RunnableConfig
from pydantic import BaseModel, Field, field_validator

from agents.state import AgentState
from utils.json_parser import parse_llm_json
from utils.llm_factory import get_llm_instance
from constants import COMMANDER_SYSTEM_PROMPT


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
        """兼容处理：如果 LLM 返回了整数依赖（如 [0]），强制转为字符串 ["0"]"""
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


async def commander_node(state: AgentState) -> Dict[str, Any]:
    """
    [指挥官] 将复杂查询拆解为子任务。
    v3.0 更新：立即持久化到数据库，发送 plan.created 事件
    """
    from langchain_core.messages import HumanMessage
    from agents.expert_loader import get_expert_config, get_expert_config_cached
    from agents.expert_loader import get_all_expert_list, format_expert_list_for_prompt
    from crud.task_session import create_task_session_with_subtasks, get_task_session_by_thread
    from crud.task_session import create_subtask
    from models import SubTaskCreate
    from utils.event_generator import event_plan_created, sse_event_to_string
    
    messages = state["messages"]
    last_message = messages[-1]
    user_query = last_message.content if isinstance(last_message, HumanMessage) else str(last_message.content)
    
    # 获取数据库会话和 thread_id
    db_session = state.get("db_session")
    thread_id = state.get("thread_id")
    
    # 加载配置 (数据库或回退)
    commander_config = None
    if db_session:
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
        from agents.graph import get_commander_llm_lazy

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
        subtasks_data = [
            SubTaskCreate(
                expert_type=task.expert_type,
                task_description=task.description,
                input_data=task.input_data,
                sort_order=idx,
                execution_mode="sequential",
                depends_on=task.depends_on if task.depends_on else None
            )
            for idx, task in enumerate(commander_response.tasks)
        ]

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
        sub_tasks_list = task_session.sub_tasks if task_session else []
        task_list = []
        for idx, subtask in enumerate(sub_tasks_list):
            commander_task = commander_response.tasks[idx]
            task_list.append({
                "id": subtask.id,
                "task_id": commander_task.id,
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
