"""
Commander 节点 - 任务规划

将复杂查询拆解为子任务，支持显式依赖关系（DAG）
"""
import os
from typing import Dict, Any, List, Optional
from datetime import datetime
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_core.runnables import RunnableConfig
from pydantic import BaseModel, Field, field_validator
from sqlmodel import Session

from agents.state import AgentState
from utils.json_parser import parse_llm_json
from utils.llm_factory import get_llm_instance
from constants import COMMANDER_SYSTEM_PROMPT
from database import engine


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


async def _preload_expert_configs(task_list: List[Dict], db_session: Any) -> None:
    """
    P1 优化: 预加载所有专家配置到缓存
    
    在 Commander 阶段就并行加载所有需要的专家配置，
    避免 GenericWorker 执行时再逐个查询数据库。
    
    Args:
        task_list: 任务列表
        db_session: 数据库会话
    """
    if not task_list or not db_session:
        return
    
    # 提取所有唯一的专家类型
    expert_types = list(set(task.get("expert_type") for task in task_list if task.get("expert_type")))
    if not expert_types:
        return
    
    print(f"[COMMANDER] P1优化: 预加载 {len(expert_types)} 个专家配置...")
    
    # 并行加载所有专家配置
    from agents.services.expert_manager import get_expert_config_cached
    
    loaded_count = 0
    for expert_type in expert_types:
        try:
            # 先从缓存检查
            cached = get_expert_config_cached(expert_type)
            if cached:
                loaded_count += 1
                continue
            
            # 缓存未命中，从数据库加载
            from agents.services.expert_manager import get_expert_config
            config = get_expert_config(expert_type, db_session)
            if config:
                loaded_count += 1
        except Exception as e:
            print(f"[COMMANDER] 预加载专家 '{expert_type}' 失败: {e}")
    
    print(f"[COMMANDER] P1优化: 成功预加载 {loaded_count}/{len(expert_types)} 个专家配置")


async def commander_node(state: AgentState, config: RunnableConfig = None) -> Dict[str, Any]:
    """
    [指挥官] 将复杂查询拆解为子任务。
    v3.0 更新：立即持久化到数据库，发送 plan.created 事件
    v3.1 更新：使用独立数据库会话，避免 MemorySaver 序列化问题
    v3.3 更新：流式思考 + JSON 生成，先展示思考过程，后输出任务规划
    v3.4 更新：使用 Shared Queue 模式实现真正的实时流式输出
    """
    from agents.services.expert_manager import get_expert_config, get_expert_config_cached
    from agents.services.expert_manager import get_all_expert_list, format_expert_list_for_prompt
    from agents.services.task_manager import get_or_create_task_session
    from models import SubTaskCreate
    from utils.event_generator import (
        event_plan_created, event_plan_started, event_plan_thinking,
        sse_event_to_string
    )
    import uuid
    
    # 🔥🔥🔥 v3.4: 获取共享队列 (Side Channel)
    stream_queue = None
    if config:
        stream_queue = config.get("configurable", {}).get("stream_queue")
        if stream_queue:
            print(f"[COMMANDER] 获取到 stream_queue，将实时推送思考内容")
    
    # 🔥 初始化事件队列（用于收集所有事件）
    event_queue = []
    
    messages = state["messages"]
    last_message = messages[-1]
    user_query = last_message.content if isinstance(last_message, HumanMessage) else str(last_message.content)
    
    # 获取 thread_id
    thread_id = state.get("thread_id")
    
    # 🔥 使用独立的数据库会话（避免 MemorySaver 序列化问题）
    with Session(engine) as db_session:
        try:
            # 加载配置 (数据库或回退)
            commander_config = get_expert_config("commander", db_session)
            
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

            # 🔥🔥🔥 v3.3: 流式思考 + JSON 生成
            # 1️⃣ 获取或生成 session_id
            # 如果 chat.py 已经发送了 plan.started，使用相同的 session_id
            preview_session_id = state.get("preview_session_id") or str(uuid.uuid4())
            
            # 🔥 只有在 chat.py 没有发送 plan.started 的情况下，才在这里发送
            if not state.get("preview_session_id"):
                started_event = event_plan_started(
                    session_id=preview_session_id,
                    title="任务规划",
                    content="正在分析需求...",
                    status="running"
                )
                event_queue.append({"type": "sse", "event": sse_event_to_string(started_event)})
                print(f"[COMMANDER] 发送 plan.started: {preview_session_id}")
            else:
                print(f"[COMMANDER] 复用 chat.py 发送的 plan.started: {preview_session_id}")
            
            # 2️⃣ 流式生成：区分 Thinking 和 JSON 阶段
            thinking_content = ""
            json_buffer = ""
            is_json_phase = False
            json_start_detected = False
            
            print("[COMMANDER] 开始流式生成...")
            print(f"[COMMANDER] stream_queue: {'已获取' if stream_queue else '未获取'}")
            
            # 🔥🔥🔥 强化 Prompt：明确要求先思考再输出 JSON
            human_prompt = f"""用户查询: {user_query}

【重要】你必须按以下步骤执行：

**步骤 1 - 需求分析（必须）:**
请先以自然语言详细分析这个需求。包括：
- 用户的核心意图是什么？
- 需要哪些步骤来完成？
- 每个步骤应该分配给哪个专家？
- 步骤之间的依赖关系是什么？

**步骤 2 - 任务规划（必须）:**
在分析完成后，输出一个 ```json 代码块，包含结构化的任务数据。

注意：不要直接输出 JSON，必须先进行详细的自然语言分析！"""
            
            chunk_count = 0
            debug_chunks = []  # 收集前10个 chunk 用于调试
            
            async for chunk in llm_with_config.astream(
                [
                    SystemMessage(content=system_prompt),
                    HumanMessage(content=human_prompt)
                ],
                config=RunnableConfig(
                    tags=["commander", "streaming"],
                    metadata={"node_type": "commander", "mode": "streaming"}
                )
            ):
                content = chunk.content if hasattr(chunk, "content") else str(chunk)
                chunk_count += 1
                
                # 🔥 收集前10个 chunk 用于调试
                if chunk_count <= 10:
                    debug_chunks.append(content)
                    print(f"[COMMANDER] Chunk {chunk_count}: {repr(content[:80])}")
                
                if not content:
                    continue
                
                # 🔥 每 50 个 chunk 打印一次日志
                if chunk_count % 50 == 0:
                    print(f"[COMMANDER] 已处理 {chunk_count} chunks, thinking_phase={not is_json_phase}, content_len={len(content)}, thinking_len={len(thinking_content)}")
                
                # 🔥 检测 JSON 开始标记（多种情况）
                if not is_json_phase:
                    # 情况1: 检测到代码块标记 ```json 或 ```
                    if "```json" in content or "```" in content:
                        print(f"[COMMANDER] 📦 检测到 JSON 开始标记，切换到 JSON 阶段")
                        is_json_phase = True
                        json_start_detected = True
                        # 提取 ```json 之前的内容（如果有）作为最后的 thinking
                        before_json = content.split("```")[0]
                        if before_json.strip():
                            thinking_content += before_json
                            thinking_event = event_plan_thinking(
                                session_id=preview_session_id,
                                delta=before_json
                            )
                            event_str = sse_event_to_string(thinking_event)
                            event_queue.append({"type": "sse", "event": event_str})
                            # 🔥🔥🔥 实时推送到共享队列
                            if stream_queue:
                                await stream_queue.put({"type": "sse", "event": event_str})
                        # 剩余部分进入 json_buffer
                        json_parts = content.split("```", 1)
                        if len(json_parts) > 1:
                            json_buffer += json_parts[1]
                        continue
                    
                    # 情况2: 检测到纯 JSON 开始（LLM 直接输出 JSON 而没有代码块）
                    # 检测条件：内容以 '{' 开头，且我们已经接收了一些内容（避免误判第一个字符）
                    if content.strip().startswith("{") and chunk_count > 1 and len(thinking_content) < 50:
                        print(f"[COMMANDER] ⚠️ 检测到纯 JSON 输出（无代码块），切换到 JSON 阶段")
                        print(f"[COMMANDER] 当前 thinking_content 长度: {len(thinking_content)}, 内容: {thinking_content[:100]}...")
                        is_json_phase = True
                        json_start_detected = True
                        json_buffer += content
                        continue
                    
                    # 📝 Thinking 阶段：实时发送 plan.thinking
                    thinking_content += content
                    thinking_event = event_plan_thinking(
                        session_id=preview_session_id,
                        delta=content
                    )
                    event_str = sse_event_to_string(thinking_event)
                    event_queue.append({"type": "sse", "event": event_str})
                    # 🔥🔥🔥 实时推送到共享队列
                    if stream_queue:
                        # 🔥 使用字典格式，与 chat.py 的 Consumer 匹配
                        await stream_queue.put({"type": "sse", "event": event_str})
                        if chunk_count <= 5:
                            print(f"[COMMANDER] 🚀 发送 plan.thinking: {content[:50]}...")
                else:
                    # 📦 JSON 阶段：静默拼接，不发送 SSE
                    # 检测 JSON 结束标记
                    if "```" in content:
                        # 提取 ``` 之前的内容
                        json_parts = content.split("```", 1)
                        json_buffer += json_parts[0]
                        # 之后的内容忽略（结束标记后的内容）
                    else:
                        json_buffer += content
            
            print(f"[COMMANDER] 流式生成完成。思考长度: {len(thinking_content)}, JSON长度: {len(json_buffer)}")
            
            # 3️⃣ 解析 JSON
            # 清理 JSON 内容（移除可能的 json 标记前缀）
            json_str = json_buffer.strip()
            if json_str.startswith("json"):
                json_str = json_str[4:].strip()
            
            try:
                commander_response = parse_llm_json(
                    json_str,
                    CommanderOutput,
                    strict=False,
                    clean_markdown=False  # 已经手动清理了
                )
                print(f"[COMMANDER] JSON 解析成功，生成 {len(commander_response.tasks)} 个任务")
            except Exception as parse_err:
                print(f"[COMMANDER] JSON 解析失败: {parse_err}")
                print(f"[COMMANDER] 原始 JSON 内容: {json_str[:500]}...")
                raise

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

            # v3.0: 立即持久化到数据库 (通过 TaskManager)
            # 🔥 v3.3: 使用 preview_session_id 确保事件和数据库记录一致
            task_session = None
            if db_session and thread_id:
                task_session, is_reused = get_or_create_task_session(
                    db=db_session,
                    thread_id=thread_id,
                    user_query=user_query,
                    plan_summary=commander_response.strategy,
                    estimated_steps=commander_response.estimated_steps,
                    subtasks_data=subtasks_data,
                    execution_mode="sequential",
                    session_id=preview_session_id  # 🔥 传入预览时使用的 session_id
                )
                session_source = "复用" if is_reused else "新建"
                print(f"[COMMANDER] TaskSession {session_source}: {task_session.session_id}")

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

            # P1 优化: 预加载所有专家配置到缓存
            await _preload_expert_configs(task_list, db_session)

            # 🔥 v3.3: 使用 preview_session_id 保持一致性，TaskSession 创建后会使用相同的 ID
            # 注意：这里不再创建新的 event_queue，而是复用之前的事件队列
            
            # 4️⃣ 发送 plan.created 事件（完成状态）
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
