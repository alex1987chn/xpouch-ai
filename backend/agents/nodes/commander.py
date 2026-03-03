"""
Commander 节点 - 任务规划与拆解

[职责]
将用户复杂查询拆解为可执行的子任务序列（SubTasks），支持：
- 专家分配（expert_type）
- 任务依赖（DAG，通过 depends_on 实现）
- 优先级排序（priority）

[执行流程]
1. 分析用户查询意图
2. 生成任务列表（使用结构化输出 CommanderOutput）
3. 创建 TaskSession 和 SubTasks（数据库持久化）
4. 预加载专家配置到缓存（P1 优化）
5. 发送 plan.created 事件（驱动前端显示 Thinking Steps）
6. 触发 HITL 中断（等待用户确认计划）

[输出结构]
CommanderOutput:
  - tasks: SubTask 列表
    - id: 任务唯一标识
    - expert_type: 执行专家类型
    - description: 任务描述
    - depends_on: 依赖任务ID列表（上游输出注入上下文）
    - priority: 执行优先级
  - strategy: 执行策略概述
  - estimated_steps: 预估步骤数

[依赖处理]
- 下游任务自动获取上游任务输出作为上下文
- 容错：缺失依赖时提示 LLM 基于现有信息尽力完成

[数据库操作]
- 创建 TaskSession（任务会话）
- 批量创建 SubTask（子任务）
- 关联 Thread（对话线程）

[HITL 集成]
- 生成 plan.created 事件后暂停（interrupt）
- 用户可修改/删除/重排任务
- 确认后 Dispatcher 按新计划执行
"""
import asyncio
import logging
import os
from typing import Any

from cachetools import TTLCache
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig
from pydantic import BaseModel, Field, ValidationError, field_validator
from sqlmodel import Session
from tenacity import (
    before_sleep_log,
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_fixed,
)

from agents.state import AgentState
from agents.state_patch import append_sse_event, get_event_queue_snapshot
from constants import COMMANDER_SYSTEM_PROMPT
from database import engine
from utils.json_parser import parse_llm_json
from utils.llm_factory import get_llm_instance
from utils.logger import logger

# P0 优化: 本地内存缓存高频查询 (5分钟TTL)
# commander 配置缓存（单例，很少变化）
_commander_config_cache: TTLCache = TTLCache(maxsize=10, ttl=300)
# 专家列表缓存（相对稳定）
_all_experts_cache: TTLCache = TTLCache(maxsize=5, ttl=60)  # 1分钟TTL，更频繁更新


# ============================================================================
# Commander 2.0: Pydantic 结构化输出模型
# ============================================================================

class Task(BaseModel):
    """任务定义 - 支持 DAG 依赖关系"""
    id: str = Field(default="", description="任务唯一标识符（短ID，如 task_1, task_2）")
    expert_type: str = Field(description="执行此任务的专家类型")
    description: str = Field(description="任务描述")
    input_data: dict[str, Any] = Field(default={}, description="输入参数")
    priority: int = Field(default=0, description="优先级 (0=最高)")
    dependencies: list[str] = Field(default=[], description="依赖的任务ID列表")

    @field_validator('dependencies', mode='before')
    @classmethod
    def parse_dependencies(cls, v):
        """兼容处理：整数依赖转为字符串"""
        if v is None:
            return []
        if isinstance(v, (int, str)):
            return [str(v)]
        if isinstance(v, list):
            return [str(item) for item in v]
        return v


class ExecutionPlan(BaseModel):
    """
    Commander 2.0 执行计划输出

    使用 Pydantic 结构化输出，确保 LLM 生成符合 Schema 的数据
    """
    thought_process: str = Field(
        default="",
        description="规划思考过程：分析需求、拆解步骤、分配专家的推理过程"
    )
    strategy: str = Field(
        description="执行策略概述：如'并行执行'、'顺序执行'、'分阶段交付'等"
    )
    estimated_steps: int = Field(
        description="预计步骤数"
    )
    tasks: list[Task] = Field(
        description="子任务列表，支持依赖关系（DAG）"
    )


# 向后兼容：保留旧模型别名
SubTaskOutput = Task
CommanderOutput = ExecutionPlan


async def _preload_expert_configs(task_list: list[dict]) -> None:
    """
    P1 优化: 预加载所有专家配置到缓存

    在 Commander 阶段就并行加载所有需要的专家配置，
    避免 GenericWorker 执行时再逐个查询数据库。

    P0 修复: 使用 asyncio.to_thread 避免阻塞事件循环

    Args:
        task_list: 任务列表
    """
    if not task_list:
        return

    # 提取所有唯一的专家类型
    expert_types = list({task.get("expert_type") for task in task_list if task.get("expert_type")})
    if not expert_types:
        return

    logger.info(f"[COMMANDER] P1优化: 预加载 {len(expert_types)} 个专家配置...")

    # P0 修复: 将数据库操作包装在 to_thread 中
    def _load_configs():
        from agents.services.expert_manager import get_expert_config, get_expert_config_cached
        loaded_count = 0
        with Session(engine) as db_session:
            for expert_type in expert_types:
                try:
                    # 先从缓存检查
                    cached = get_expert_config_cached(expert_type)
                    if cached:
                        loaded_count += 1
                        continue

                    # 缓存未命中，从数据库加载
                    config = get_expert_config(expert_type, db_session)
                    if config:
                        loaded_count += 1
                except Exception as e:
                    logger.warning(f"[COMMANDER] 预加载专家 '{expert_type}' 失败: {e}")
        return loaded_count

    loaded_count = await asyncio.to_thread(_load_configs)
    logger.info(f"[COMMANDER] P1优化: 成功预加载 {loaded_count}/{len(expert_types)} 个专家配置")


async def commander_node(state: AgentState, config: RunnableConfig = None) -> dict[str, Any]:
    """
    [指挥官] 将复杂查询拆解为子任务。
    v3.0 更新：立即持久化到数据库，发送 plan.created 事件
    v3.1 更新：使用独立数据库会话，避免 MemorySaver 序列化问题
    v3.3 更新：流式思考 + JSON 生成，先展示思考过程，后输出任务规划
    v3.4 更新：使用事件驱动流式输出，通过 event_queue 实时推送 plan.thinking 事件
    """
    import uuid

    from agents.services.expert_manager import (
        format_expert_list_for_prompt,
        get_all_expert_list,
        get_expert_config,
        get_expert_config_cached,
    )
    from agents.services.task_manager import get_or_create_task_session
    from models import SubTaskCreate
    from utils.event_generator import (
        event_plan_created,
        event_plan_started,
        sse_event_to_string,
    )

    # 🔥 初始化事件队列（用于收集所有事件）
    event_queue = get_event_queue_snapshot(state)

    messages = state["messages"]
    last_message = messages[-1]
    user_query = last_message.content if isinstance(last_message, HumanMessage) else str(last_message.content)

    # 获取 thread_id
    thread_id = state.get("thread_id")

    # 🔥 使用独立的数据库会话（避免 MemorySaver 序列化问题）
    # P0 修复 + 优化: 优先使用本地内存缓存，缓存未命中才走线程池
    try:
        # 1️⃣ 优先从本地内存缓存读取 commander 配置（零阻塞）
        commander_config = _commander_config_cache.get("commander")
        if commander_config:
            logger.info("[COMMANDER] 本地缓存命中: commander 配置")
        else:
            # 2️⃣ 检查全局缓存
            commander_config = get_expert_config_cached("commander")
            if commander_config:
                logger.info("[COMMANDER] 全局缓存命中: commander 配置")
                _commander_config_cache["commander"] = commander_config
            else:
                # 3️⃣ 缓存未命中，使用线程池查数据库
                logger.info("[COMMANDER] 缓存未命中，查询数据库: commander 配置")
                def _load_commander_config():
                    with Session(engine) as db_session:
                        return get_expert_config("commander", db_session)

                commander_config = await asyncio.to_thread(_load_commander_config)
                # 4️⃣ 写入本地缓存
                if commander_config:
                    _commander_config_cache["commander"] = commander_config

        if not commander_config:
            # 回退：使用常量中的 Prompt 和硬编码的模型
            system_prompt = COMMANDER_SYSTEM_PROMPT
            model = os.getenv("MODEL_NAME", "deepseek-chat")
            temperature = 0.5
            logger.info(f"[COMMANDER] 使用默认回退配置: model={model}")
        else:
            # 使用数据库配置
            system_prompt = commander_config["system_prompt"]
            model = commander_config["model"]
            temperature = commander_config["temperature"]
            logger.info(f"[COMMANDER] 加载配置: model={model}, temperature={temperature}")

            # 🔥🔥🔥 Commander 2.0: 占位符自动填充
            # 填充 {user_query} 和 {dynamic_expert_list}
            try:
                # 获取所有可用专家（包括动态创建的专家）
                # P0 修复 + 优化: 优先使用本地内存缓存
                all_experts = _all_experts_cache.get("all_experts")
                if all_experts:
                    logger.info("[COMMANDER] 本地缓存命中: 专家列表")
                else:
                    logger.info("[COMMANDER] 缓存未命中，查询数据库: 专家列表")
                    # P0 修复: 使用 asyncio.to_thread 避免阻塞事件循环
                    def _load_all_experts():
                        with Session(engine) as db_session:
                            return get_all_expert_list(db_session)

                    all_experts = await asyncio.to_thread(_load_all_experts)
                    # 写入本地缓存
                    if all_experts:
                        _all_experts_cache["all_experts"] = all_experts

                expert_list_str = format_expert_list_for_prompt(all_experts)

                # 构建占位符映射
                placeholder_map = {
                    "user_query": user_query,
                    "dynamic_expert_list": expert_list_str
                }

                # 替换所有支持的占位符
                for placeholder, value in placeholder_map.items():
                    placeholder_pattern = f"{{{placeholder}}}"
                    if placeholder_pattern in system_prompt:
                        system_prompt = system_prompt.replace(placeholder_pattern, value)
                        logger.info(f"[COMMANDER] 已注入占位符: {{{placeholder}}}")

                # 检查是否还有未填充的占位符（警告但不中断）
                import re
                remaining_placeholders = re.findall(r'\{([a-zA-Z_][a-zA-Z0-9_]*)\}', system_prompt)
                if remaining_placeholders:
                    logger.warning(f"[COMMANDER] 警告: 以下占位符未填充: {remaining_placeholders}")

            except Exception as e:
                # 注入失败时不中断流程，保留原始 Prompt
                logger.warning(f"[COMMANDER] 占位符填充失败（已忽略）: {e}")

            # 执行 LLM 进行规划
            # 从模型名称推断 provider
            from agents.graph import get_commander_llm_lazy
            from providers_config import get_model_config

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
                logger.info(f"[COMMANDER] 模型 '{model}' -> '{actual_model}' 使用 provider: {provider}, temperature: {final_temperature}")
                llm_with_config = llm.bind(model=actual_model, temperature=final_temperature)
            else:
                # 回退到 commander_llm（硬编码的 provider 优先级）
                logger.warning(f"[COMMANDER] 模型 '{model}' 未找到 provider 配置，回退到 commander_llm")
                llm_with_config = get_commander_llm_lazy().bind(model=model, temperature=temperature)

            # 🔥🔥🔥 Commander 2.0: JSON Mode + Pydantic 强校验
            # 1️⃣ 获取或生成 session_id
            preview_session_id = state.get("preview_session_id") or str(uuid.uuid4())

            # 🔥 只有在 chat.py 没有发送 plan.started 的情况下，才在这里发送
            if not state.get("preview_session_id"):
                started_event = event_plan_started(
                    session_id=preview_session_id,
                    title="任务规划",
                    content="正在分析需求...",
                    status="running"
                )
                event_queue = append_sse_event(event_queue, sse_event_to_string(started_event))
                logger.info(f"[COMMANDER] 发送 plan.started: {preview_session_id}")
            else:
                logger.info(f"[COMMANDER] 复用 chat.py 发送的 plan.started: {preview_session_id}")

            # 2️⃣ 使用 JSON Mode + Pydantic 强校验生成计划
            # 🔥 Commander 2.0: DeepSeek 兼容的 JSON Mode 实现
            human_prompt = f"用户查询: {user_query}\n\n请分析需求并生成执行计划。"

            logger.info("[COMMANDER] 使用 JSON Mode + Pydantic 校验生成执行计划...")
            commander_response, event_queue = await _generate_plan_with_json_mode(
                llm_with_config, system_prompt, human_prompt,
                preview_session_id, event_queue
            )

            # v3.1: 兜底处理 - 如果 LLM 没有生成 id，自动生成
            for idx, task in enumerate(commander_response.tasks):
                if not task.id:
                    task.id = f"task_{idx}"
                    logger.info(f"[COMMANDER] 自动为任务 {idx} 生成 id: {task.id}")

            # v3.2: 修复依赖上下文注入 - 将 dependencies 中的索引格式转换为 ID 格式
            task_id_map = {str(idx): task.id for idx, task in enumerate(commander_response.tasks)}
            for task in commander_response.tasks:
                if task.dependencies:
                    new_dependencies = []
                    for dep in task.dependencies:
                        # 如果是数字索引（如 "0"），转换为对应的 ID（如 "task_0"）
                        if dep in task_id_map:
                            new_dependencies.append(task_id_map[dep])
                        else:
                            # 如果已经是正确的 ID 格式（如 "task_0"），保持不变
                            new_dependencies.append(dep)
                    task.dependencies = new_dependencies
                    logger.info(f"[COMMANDER] 任务 {task.id} 的依赖已转换: {new_dependencies}")

            # v3.0: 准备子任务数据（支持显式依赖关系 DAG）
            # 🔥 关键修复：传递 task_id 用于 depends_on 映射
            subtasks_data = [
                SubTaskCreate(
                    expert_type=task.expert_type,
                    task_description=task.description,
                    input_data=task.input_data,
                    sort_order=idx,
                    execution_mode="sequential",
                    depends_on=task.dependencies if task.dependencies else None,
                    task_id=task.id  # 🔥 关键：传递 Commander 生成的 task ID
                )
                for idx, task in enumerate(commander_response.tasks)
            ]

            # v3.0: 立即持久化到数据库 (通过 TaskManager)
            # 🔥 v3.3: 使用 preview_session_id 确保事件和数据库记录一致
            # P0 修复: 使用 asyncio.to_thread 避免阻塞事件循环
            task_session_id = None
            sub_tasks_list = []
            if thread_id:
                def _create_task_session():
                    from crud.task_session import get_subtasks_by_session

                    with Session(engine) as db_session:
                        created_session, is_reused = get_or_create_task_session(
                            db=db_session,
                            thread_id=thread_id,
                            user_query=user_query,
                            plan_summary=commander_response.strategy,
                            estimated_steps=commander_response.estimated_steps,
                            subtasks_data=subtasks_data,
                            execution_mode="sequential",
                            session_id=preview_session_id
                        )

                        # 在会话关闭前完成子任务数据读取，避免 detached 实例懒加载
                        persisted_subtasks = get_subtasks_by_session(
                            db_session, created_session.session_id
                        )
                        serialized_subtasks = [
                            {
                                "id": subtask.id,
                                "expert_type": subtask.expert_type,
                                "task_description": subtask.task_description,
                                "input_data": subtask.input_data,
                                "sort_order": subtask.sort_order,
                                "status": subtask.status,
                            }
                            for subtask in persisted_subtasks
                        ]
                        return created_session.session_id, is_reused, serialized_subtasks

                task_session_id, is_reused, sub_tasks_list = await asyncio.to_thread(_create_task_session)
                session_source = "复用" if is_reused else "新建"
                logger.info(f"[COMMANDER] TaskSession {session_source}: {task_session_id}")

                # 🔥🔥🔥 关键修复：更新 thread.task_session_id，确保前端能查询到
                # P0 修复: 使用 asyncio.to_thread 避免阻塞事件循环
                from models import Thread

                def _update_thread():
                    with Session(engine) as db_session:
                        thread = db_session.get(Thread, thread_id)
                        if thread:
                            thread.task_session_id = task_session_id
                            thread.agent_type = "ai"  # 🔥 同时更新 agent_type
                            db_session.add(thread)
                            db_session.commit()
                            return True
                        return False

                updated = await asyncio.to_thread(_update_thread)
                if updated:
                    logger.info(f"[COMMANDER] ✅ 已更新 thread.task_session_id: {task_session_id}")

            # 转换为内部字典格式（用于 LangGraph 状态流转）
            task_list = []
            for idx, subtask in enumerate(sub_tasks_list):
                commander_task = commander_response.tasks[idx]
                task_list.append({
                    "id": subtask["id"],
                    "task_id": commander_task.id,
                    "expert_type": subtask["expert_type"],
                    "description": subtask["task_description"],
                    "input_data": subtask["input_data"],
                    "sort_order": subtask["sort_order"],
                    "status": subtask["status"],
                    "depends_on": commander_task.dependencies if commander_task.dependencies else [],
                    "output_result": None,
                    "started_at": None,
                    "completed_at": None
                })

            logger.info(f"[COMMANDER] 生成了 {len(task_list)} 个任务。策略: {commander_response.strategy}")

            # P1 优化: 预加载所有专家配置到缓存
            # P0 修复: 传入 engine 而不是 db_session，让函数内部自己管理会话
            await _preload_expert_configs(task_list)

            # 🔥 v3.3: 使用 preview_session_id 保持一致性，TaskSession 创建后会使用相同的 ID
            # 注意：这里不再创建新的 event_queue，而是复用之前的事件队列

            # 4️⃣ 发送 plan.created 事件（完成状态）
            if task_session_id:
                plan_event = event_plan_created(
                    session_id=task_session_id,
                    summary=commander_response.strategy,
                    estimated_steps=commander_response.estimated_steps,
                    execution_mode="sequential",
                    tasks=[
                        {
                            "id": t["id"],
                            "task_id": commander_response.tasks[idx].id,
                            "expert_type": t["expert_type"],
                            "description": t["task_description"],
                            "sort_order": t["sort_order"],
                            "status": t["status"],
                            "depends_on": commander_response.tasks[idx].dependencies if commander_response.tasks[idx].dependencies else []
                        }
                        for idx, t in enumerate(sub_tasks_list)
                    ]
                )
                event_queue = append_sse_event(event_queue, sse_event_to_string(plan_event))

            return {
                "task_list": task_list,
                "strategy": commander_response.strategy,
                "current_task_index": 0,
                "expert_results": [],
                "task_session_id": task_session_id,
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
        logger.error(f"[ERROR] Commander 规划失败: {e}", exc_info=True)
        return {
            "task_list": [],
            "strategy": f"Error: {str(e)}",
            "current_task_index": 0,
            "event_queue": []
        }


def _extract_json_string(content: str) -> str:
    """
    从 LLM 响应中提取 JSON 字符串

    处理以下情况:
    1. Markdown 代码块 (```json ... ```)
    2. 纯 JSON 文本
    3. 前后有额外文本的情况
    """
    content = content.strip()

    # 情况 1: Markdown 代码块
    if content.startswith("```"):
        lines = content.split("\n")
        # 找到第一个和最后一个 ```
        start_idx = 0
        end_idx = len(lines) - 1

        # 跳过开头的 ``` 或 ```json
        for i, line in enumerate(lines):
            if line.strip().startswith("```"):
                start_idx = i + 1
                break

        # 找到结尾的 ```
        for i in range(len(lines) - 1, -1, -1):
            if lines[i].strip() == "```":
                end_idx = i
                break

        json_content = "\n".join(lines[start_idx:end_idx])
        return json_content.strip()

    # 情况 2: 尝试找到 JSON 对象的开始和结束
    # 找到第一个 { 和最后一个 }
    start = content.find("{")
    end = content.rfind("}")

    if start != -1 and end != -1 and end > start:
        return content[start:end+1]

    # 情况 3: 已经是纯 JSON
    return content


async def _generate_plan_once(
    llm_with_config,
    enhanced_system_prompt: str,
    human_prompt: str,
    preview_session_id: str,
    event_queue: list[dict[str, Any]],
) -> tuple[ExecutionPlan, list[dict[str, Any]]]:
    """
    单次生成执行计划（用于 tenacity 重试）
    """
    from utils.event_generator import event_plan_thinking, sse_event_to_string

    json_mode_llm = llm_with_config.bind(
        response_format={"type": "json_object"}
    )

    response = await json_mode_llm.ainvoke(
        [
            SystemMessage(content=enhanced_system_prompt),
            HumanMessage(content=human_prompt)
        ],
        config=RunnableConfig(
            tags=["commander", "json_mode"],
            metadata={"node_type": "commander", "mode": "json_object"}
        )
    )

    raw_content = response.content if hasattr(response, 'content') else str(response)

    # 发送 thinking 事件
    thinking_preview = raw_content[:200] + "..." if len(raw_content) > 200 else raw_content
    thinking_event = event_plan_thinking(
        session_id=preview_session_id,
        delta=f"[规划分析中...]\n{thinking_preview}"
    )
    next_event_queue = append_sse_event(event_queue, sse_event_to_string(thinking_event))

    # 提取和校验 JSON
    cleaned_content = _extract_json_string(raw_content)
    return ExecutionPlan.model_validate_json(cleaned_content), next_event_queue


@retry(
    retry=retry_if_exception_type((ValidationError, Exception)),
    stop=stop_after_attempt(2),
    wait=wait_fixed(0.5),
    before_sleep=before_sleep_log(logger, logging.WARNING),
    reraise=True
)
async def _generate_plan_with_json_mode(
    llm_with_config,
    system_prompt: str,
    human_prompt: str,
    preview_session_id: str,
    event_queue: list[dict[str, Any]],
) -> tuple[ExecutionPlan, list[dict[str, Any]]]:
    """
    Commander 2.0: 使用 JSON Mode + Pydantic 强校验生成执行计划

    P1 优化: 使用 tenacity 统一重试机制
    """
    enhanced_system_prompt = system_prompt + """

IMPORTANT: You MUST output a valid JSON object. No conversation, no markdown code blocks, just raw JSON text."""

    try:
        return await _generate_plan_once(
            llm_with_config, enhanced_system_prompt, human_prompt,
            preview_session_id, event_queue
        )
    except ValidationError as e:
        logger.warning(f"[COMMANDER] Pydantic 校验失败: {e}")
        raise
    except Exception as e:
        logger.warning(f"[COMMANDER] 生成计划失败: {e}")
        raise


# 保留旧函数作为兜底（当 JSON Mode 完全不可用时）
async def _streaming_planning_fallback(
    llm_with_config,
    system_prompt: str,
    human_prompt: str,
    preview_session_id: str,
    event_queue: list[dict[str, Any]],
) -> tuple[ExecutionPlan, list[dict[str, Any]]]:
    """
    兜底方案：使用流式解析生成执行计划

    当 JSON Mode 也完全不可用时使用
    """
    from utils.event_generator import event_plan_thinking, sse_event_to_string

    thinking_content = ""
    json_buffer = ""
    is_json_phase = False

    logger.info("[COMMANDER] Fallback: 使用流式解析...")

    async for chunk in llm_with_config.astream(
        [
            SystemMessage(content=system_prompt),
            HumanMessage(content=human_prompt)
        ],
        config=RunnableConfig(
            tags=["commander", "streaming", "fallback"],
            metadata={"node_type": "commander", "mode": "fallback"}
        )
    ):
        content = chunk.content if hasattr(chunk, "content") else str(chunk)
        if not content:
            continue

        if not is_json_phase:
            if "```json" in content or "```" in content:
                is_json_phase = True
                before_json = content.split("```")[0]
                if before_json.strip():
                    thinking_content += before_json
                    thinking_event = event_plan_thinking(
                        session_id=preview_session_id,
                        delta=before_json
                    )
                    event_queue = append_sse_event(event_queue, sse_event_to_string(thinking_event))
                json_parts = content.split("```", 1)
                if len(json_parts) > 1:
                    json_buffer += json_parts[1]
                continue

            thinking_content += content
            thinking_event = event_plan_thinking(
                session_id=preview_session_id,
                delta=content
            )
            event_queue = append_sse_event(event_queue, sse_event_to_string(thinking_event))
        else:
            if "```" in content:
                json_parts = content.split("```", 1)
                json_buffer += json_parts[0]
            else:
                json_buffer += content

    # 解析 JSON
    json_str = json_buffer.strip()
    if json_str.startswith("json"):
        json_str = json_str[4:].strip()

    try:
        commander_response = parse_llm_json(
            json_str,
            ExecutionPlan,
            strict=False,
            clean_markdown=False
        )
        logger.info(f"[COMMANDER] 流式解析成功，生成 {len(commander_response.tasks)} 个任务")
        return commander_response, event_queue
    except Exception as parse_err:
        logger.warning(f"[COMMANDER] 流式解析失败: {parse_err}")
        raise
