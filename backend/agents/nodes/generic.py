"""
Generic Worker 节点 - 通用专家执行

[职责]
执行单个专家任务，支持：
- 专家配置动态加载（数据库 + 缓存）
- 工具调用（Function Calling）
- 批处理 Artifact 交付（完成后全量推送）
- 上下文组装（上游依赖任务输出注入）

[执行流程]
1. 从 state 获取当前任务（current_task_index）
2. 加载专家配置（system_prompt, model, temperature）
3. 组装上下文（系统提示 + 上游任务输出 + 当前任务输入）
4. 调用 LLM（批处理模式）
5. 处理工具调用（如有）
6. 生成 Artifact（代码/文档/HTML）- 批处理交付
7. 发送 task.completed 事件（包含完整 Artifact）
8. 更新任务状态到数据库
9. 递增 current_task_index，返回控制给 Dispatcher

[工具调用流程]
首次调用 -> LLM 返回 tool_calls -> ToolNode 执行 ->
再次调用 -> LLM 看到 ToolMessage -> 生成最终回复

[批处理交付]
所有专家统一使用 ainvoke 等待完整响应：
- 生成的 Artifact 在 task.completed 事件中全量推送
- 前端在任务完成时一次性渲染完整内容
- 简化架构，避免流式同步问题

[依赖注入]
- 根据 depends_on 查找上游任务输出
- 注入到当前任务上下文
- 缺失依赖时容错处理（提示 LLM 尽力完成）

[Artifact 生成]
- 从 LLM 响应提取代码块
- 识别语言类型（自动检测或指定）
- 创建 Artifact 记录（数据库 + 事件推送）
- 支持多个 Artifact（一个任务可产出多个文件）

[错误处理]
- 专家配置不存在：返回 failed 状态
- LLM 调用异常：记录错误，标记失败
- 工具执行失败：返回错误信息，LLM 生成容错回复

[状态更新]
- task_list[current_index]: 更新 output_result, status, completed_at
- expert_results: 追加执行结果（供下游任务使用）
- event_queue: 推送 task.started/completed 事件

v3.7 优化: P0 修复 + TTLCache 本地内存缓存高频查询
"""

import asyncio  # 🔥 用于异步保存专家执行结果
import json
import os
import re
from datetime import datetime
from typing import Any

from cachetools import TTLCache
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.runnables import RunnableConfig

from agents.services.expert_manager import get_expert_config_cached
from agents.state_patch import append_sse_event, get_event_queue_snapshot, replace_task_item
from providers_config import get_model_config, load_providers_config
from services.memory_manager import memory_manager  # 🔥 导入记忆管理器
from tools import ALL_TOOLS as BASE_TOOLS  # 🔥 MCP: 导入基础工具集
from utils.llm_factory import get_effective_model, get_expert_llm
from utils.logger import logger
from utils.prompt_utils import enhance_system_prompt_with_tools  # v3.6: 提取到工具函数

# P0 优化: 本地内存缓存高频专家配置查询 (5分钟TTL, 最大200条)
_generic_expert_cache: TTLCache = TTLCache(maxsize=200, ttl=300)


class GenericWorkerError(Exception):
    """Generic Worker 业务异常基类。"""


class ExpertExecutionError(GenericWorkerError):
    """专家执行失败（LLM 调用 / 工具流程）异常。"""


def normalize_message_content(content: str | list | Any) -> str:
    """
    将消息内容规范化为字符串格式。

    某些模型（如 DeepSeek）要求 message content 必须是字符串，
    但 ToolMessage 的 content 可能是 list[str | dict]，需要转换。

    Args:
        content: 原始内容，可能是 str, list, dict 等

    Returns:
        str: 规范化后的字符串内容
    """
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        # 将列表转换为 JSON 字符串
        return json.dumps(content, ensure_ascii=False)
    if isinstance(content, dict):
        return json.dumps(content, ensure_ascii=False)
    # 其他类型转为字符串
    return str(content)


def normalize_messages_for_llm(
    messages: list[BaseMessage], content_mode: str = "auto"
) -> list[BaseMessage]:
    """
    规范化消息列表，根据模型要求处理 content 格式。

    不同模型对 message content 的要求不同：
    - string 模式：content 必须是字符串（DeepSeek, MiniMax, Moonshot 等国产模型）
    - auto 模式：原生支持 list[str | dict]（OpenAI, Anthropic, Gemini 等）

    Args:
        messages: 原始消息列表
        content_mode: 内容模式，"string" 或 "auto"

    Returns:
        List[BaseMessage]: 规范化后的消息列表
    """
    # auto 模式下不需要转换，直接返回原消息
    if content_mode == "auto":
        return messages

    # string 模式下需要转换 ToolMessage content
    normalized = []
    for msg in messages:
        if isinstance(msg, ToolMessage):
            # ToolMessage 的 content 可能是 list/dict，需要转换为字符串
            normalized_content = normalize_message_content(msg.content)
            if normalized_content != msg.content:
                # 创建新的 ToolMessage，保留其他字段
                normalized.append(
                    ToolMessage(
                        content=normalized_content,
                        tool_call_id=msg.tool_call_id,
                        name=msg.name,
                        additional_kwargs=msg.additional_kwargs,
                        response_metadata=msg.response_metadata,
                    )
                )
            else:
                normalized.append(msg)
        else:
            normalized.append(msg)
    return normalized


async def generic_worker_node(
    state: dict[str, Any], config: RunnableConfig = None, llm=None
) -> dict[str, Any]:
    """
    通用专家执行节点

    根据 state["current_task"]["expert_type"] 从数据库加载专家配置并执行。
    用于处理动态创建的自定义专家。

    支持工具调用流程：
    1. 首次调用：LLM 可能返回 tool_calls
    2. 工具执行后：LLM 看到 ToolMessage，生成最终回复

    🔥 v4.0 重构：批处理模式
    - 所有专家统一使用 ainvoke 等待完整响应
    - Artifact 在 task.completed 事件中全量推送
    - 简化架构，避免流式同步问题

    Args:
        state: AgentState，包含 task_list, current_task_index 等
        llm: 可选的 LLM 实例，如果不提供则根据专家配置创建

    Returns:
        Dict: 执行结果，包含 output_result, status, artifact 等
    """
    from langchain_core.messages import ToolMessage

    # 获取当前任务
    task_list = state.get("task_list", [])
    current_index = state.get("current_task_index", 0)
    existing_messages = state.get("messages", [])

    if current_index >= len(task_list):
        return {
            "output_result": "没有待执行的任务",
            "status": "failed",
            "error": "Task index out of range",
            "started_at": datetime.now().isoformat(),
            "completed_at": datetime.now().isoformat(),
        }

    current_task = task_list[current_index]
    expert_type = current_task.get("expert_type", "")
    description = current_task.get("description", "")
    input_data = current_task.get("input_data", {})

    if not expert_type:
        return {
            "output_result": "任务缺少 expert_type 字段",
            "status": "failed",
            "error": "Missing expert_type in task",
            "started_at": datetime.now().isoformat(),
            "completed_at": datetime.now().isoformat(),
        }

    # P0 修复 + 优化: 优先使用本地内存缓存，缓存未命中才查数据库
    # 1️⃣ 优先从本地内存缓存读取（不走线程池，零阻塞）
    expert_config = _generic_expert_cache.get(expert_type)
    if expert_config:
        logger.info(f"[GenericWorker] 本地缓存命中: {expert_type}")
    else:
        # 2️⃣ 检查全局缓存
        expert_config = get_expert_config_cached(expert_type)
        if expert_config:
            logger.info(f"[GenericWorker] 全局缓存命中: {expert_type}")
            # 同步到本地缓存
            _generic_expert_cache[expert_type] = expert_config
        else:
            # 3️⃣ 缓存未命中，可能是自定义专家，尝试直接查数据库
            logger.info(f"[GenericWorker] 缓存未命中，查询数据库: {expert_type}")
            from sqlmodel import Session

            from agents.services.expert_manager import get_expert_config
            from database import engine

            # P0 修复: 使用 asyncio.to_thread 避免阻塞事件循环
            def _load_expert_config():
                with Session(engine) as session:
                    return get_expert_config(expert_type, session)

            expert_config = await asyncio.to_thread(_load_expert_config)
            if expert_config:
                logger.info(f"[GenericWorker] 从数据库加载成功: {expert_type}")
                # 4️⃣ 写入本地缓存
                _generic_expert_cache[expert_type] = expert_config

    if not expert_config:
        return {
            "output_result": f"专家 '{expert_type}' 未找到",
            "status": "failed",
            "error": f"Expert '{expert_type}' not found in database",
            "started_at": datetime.now().isoformat(),
            "completed_at": datetime.now().isoformat(),
        }

    started_at = datetime.now()

    # ✅ 发送 task.started 事件（专家开始执行）
    from utils.event_generator import event_task_started, sse_event_to_string

    task_id = current_task.get("id", str(current_index))
    started_event = event_task_started(
        task_id=task_id, expert_type=expert_type, description=description
    )
    # 将 started 事件放入 state 的 event_queue，让 dispatcher 或其他节点处理
    # 使用不可变更新，避免原地修改上游 state 对象
    initial_event_queue = append_sse_event(
        get_event_queue_snapshot(state),
        sse_event_to_string(started_event),
    )
    logger.info(f"[GenericWorker] 已生成 task.started 事件: {expert_type}")

    try:
        # 获取专家配置参数
        system_prompt = expert_config["system_prompt"]
        expert_name = expert_config.get("name", expert_type)

        # 应用模型兜底机制
        configured_model = expert_config.get("model")
        effective_model = get_effective_model(configured_model)

        # 获取模型配置以确定实际的 API 模型名称和温度
        model_config = get_model_config(effective_model)
        if model_config:
            actual_model = model_config.get("model", effective_model)
            temperature = model_config.get("temperature", expert_config.get("temperature", 0.7))
            provider = model_config.get("provider")
        else:
            actual_model = effective_model
            temperature = expert_config.get("temperature", 0.7)
            provider = None

        # 🔥🔥🔥 获取 provider 的 content_mode 配置
        content_mode = "string"  # 默认使用 string 模式（安全）
        if provider:
            providers_config = load_providers_config()
            provider_config = providers_config.get("providers", {}).get(provider, {})
            content_mode = provider_config.get("content_mode", "string")

        logger.info(
            f"[GenericWorker] Running '{expert_type}' ({expert_name}) with model={actual_model}, temp={temperature}, content_mode={content_mode}"
        )

        # 如果没有提供 LLM 实例，根据配置创建
        if llm is None:
            # 根据模型配置获取 provider
            if model_config:
                provider = model_config.get("provider")
                llm = get_expert_llm(provider=provider, model=actual_model, temperature=temperature)
            else:
                llm = get_expert_llm(model=actual_model, temperature=temperature)

        # 绑定模型和温度参数
        llm_with_config = llm.bind(model=actual_model, temperature=temperature)

        # 🔥🔥🔥 GenericWorker 2.0: 占位符填充 + System Prompt 增强
        # 填充 {input} 占位符（任务描述）
        if "{input}" in system_prompt:
            system_prompt = system_prompt.replace("{input}", description)
            logger.info(f"[GenericWorker] 已注入占位符: {{input}} = {description[:50]}...")

        # 增强 System Prompt (注入时间 + 工具指令)
        enhanced_system_prompt = enhance_system_prompt_with_tools(system_prompt)

        # 🔥 关键修复：构建消息列表
        # 如果有现有的 messages（包含 ToolMessage），则使用它们
        # 否则创建新的消息列表
        has_tool_message = False
        if existing_messages:
            # 工具执行后的情况：messages 包含 AIMessage(tool_calls) + ToolMessage
            # 我们需要保留这些上下文，让 LLM 看到工具结果
            # 检查最后一条是否是 ToolMessage
            if existing_messages and isinstance(existing_messages[-1], ToolMessage):
                has_tool_message = True

            # 🔥🔥🔥 关键修复：规范化 ToolMessage content
            # 根据 provider 的 content_mode 决定是否转换（string 模式需转换，auto 模式保持原样）
            normalized_existing = normalize_messages_for_llm(existing_messages, content_mode)

            messages_for_llm = [
                SystemMessage(content=enhanced_system_prompt),
                *normalized_existing,  # 包含 AIMessage(tool_calls) 和 ToolMessage
            ]
        else:
            # 首次调用：创建新的消息列表
            # 🔥🔥🔥 智能上下文组装：处理依赖缺失的情况
            expert_results = state.get("expert_results", [])
            depends_on = current_task.get("depends_on", [])

            # 构建上下文提示
            context_parts = []
            missing_deps = []

            if depends_on:
                # 查找依赖任务的输出
                # 🔥🔥🔥 关键修复：双保险匹配，支持 task_id 和 db_uuid
                for dep_id in depends_on:
                    dep_result = next(
                        (
                            r
                            for r in expert_results
                            if r.get("task_id") == dep_id or r.get("db_uuid") == dep_id
                        ),
                        None,
                    )
                    if dep_result and dep_result.get("output"):
                        context_parts.append(
                            f"【上游任务 {dep_id} 的输出】:\n{dep_result['output'][:2000]}..."
                        )
                        logger.info(
                            f"[GenericWorker] ✅ 找到依赖 {dep_id}: {len(dep_result['output'])} 字符"
                        )
                    else:
                        missing_deps.append(dep_id)
                        logger.warning(
                            f"[GenericWorker] ⚠️ 未找到依赖 {dep_id}, 可用结果: {[r.get('task_id') for r in expert_results]}"
                        )

            # 组装任务提示
            task_prompt = f"任务描述: {description}\n\n"

            if context_parts:
                task_prompt += "参考上下文:\n" + "\n---\n".join(context_parts) + "\n\n"

            # 🔥 关键：注入容错指令
            if missing_deps:
                task_prompt += f"""⚠️ 注意：部分上游依赖任务 ({", ".join(missing_deps)}) 已被移除或未执行。
如果任务描述中引用了这些缺失部分（如代码、数据等），请忽略该引用，
并基于当前现有的信息，尽最大努力完成任务。不要在输出中抱怨缺少信息。\n\n"""

            task_prompt += f"输入参数:\n{_format_input_data(input_data)}"

            messages_for_llm = [
                SystemMessage(content=enhanced_system_prompt),
                HumanMessage(content=task_prompt),
            ]

        # 🔥 关键修复：根据是否有 ToolMessage 决定是否绑定工具
        # 如果已经有 ToolMessage（工具执行完成），则不绑定工具，防止无限循环
        if has_tool_message:
            llm_to_use = llm_with_config
        else:
            # 🔥 新增：为所有专家绑定工具（联网搜索、时间、计算器）
            # 如果 LLM 支持工具调用，则绑定工具集
            # 🔥 环境变量控制：ENABLE_TOOL_CALLING=false 可禁用工具调用（平滑升级兼容）
            enable_tools = os.getenv("ENABLE_TOOL_CALLING", "true").lower() == "true"
            if enable_tools:
                try:
                    # 🔥 MCP: 从 config 获取动态注入的工具
                    mcp_tools = []
                    if config and hasattr(config, "get"):
                        mcp_tools = config.get("configurable", {}).get("mcp_tools", [])

                    # 🔥 MCP: 合并基础工具和动态 MCP 工具
                    runtime_tools = list(BASE_TOOLS) + list(mcp_tools)

                    # 🔥 警告：如果 MCP 工具为空但预期应该有
                    if not mcp_tools and os.getenv("MCP_SERVERS"):
                        logger.warning("[GenericWorker] ⚠️ MCP 工具为空！请检查 MCP 服务器连接")

                    llm_to_use = llm_with_config.bind_tools(runtime_tools)
                    logger.info(
                        f"[GenericWorker] 🔧 工具已绑定: {len(runtime_tools)} 个工具 (基础: {len(BASE_TOOLS)}, MCP: {len(mcp_tools)})"
                    )
                except Exception as e:
                    logger.warning(f"[GenericWorker] ⚠️ 工具绑定失败（模型可能不支持工具调用）: {e}")
                    llm_to_use = llm_with_config
            else:
                logger.info("[GenericWorker] ⏭️ 工具调用已禁用（ENABLE_TOOL_CALLING=false）")
                llm_to_use = llm_with_config

        # 🔥 关键优化：当 has_tool_message=True 时，在消息末尾添加明确的"任务完成"提示
        if has_tool_message:
            # 在消息列表末尾添加一个 HumanMessage，明确告诉 LLM 任务完成
            messages_for_llm.append(
                HumanMessage(
                    content="[系统提示：以上是工具执行结果，请基于此结果生成最终回复，任务已完成，不要再调用任何工具]"
                )
            )

        # 🔥🔥🔥 v4.0 重构：统一使用批处理模式
        # 所有专家统一使用 ainvoke 等待完整响应
        # Artifact 在 task.completed 事件中全量推送
        try:
            response = await llm_to_use.ainvoke(
                messages_for_llm,
                config=RunnableConfig(
                    tags=["expert", expert_type, "generic_worker"],
                    metadata={"node_type": "expert", "expert_type": expert_type},
                ),
            )
        except TimeoutError as exc:
            raise ExpertExecutionError("LLM 调用超时") from exc
        except Exception as exc:
            raise ExpertExecutionError(f"LLM 调用失败: {exc}") from exc

        # 生成 artifact_id
        import uuid

        artifact_id = str(uuid.uuid4())

        # 🔥 关键修复：检查响应中是否包含工具调用
        has_tool_calls = hasattr(response, "tool_calls") and response.tool_calls

        if has_tool_calls:
            logger.info(f"[GenericWorker] 🔧 LLM 返回了工具调用！数量: {len(response.tool_calls)}")
            for tool_call in response.tool_calls:
                tool_name = tool_call.get("name", "unknown")
                tool_args = tool_call.get("args", {})
                logger.info(
                    f"[GenericWorker]   - 工具: {tool_name} | 专家: {expert_type} | 任务: {task_id}"
                )
                # 🔥 详细的工具调用日志（用于分析）
                logger.info(
                    "[ToolUsage] expert=%s tool=%s task_id=%s args=%s",
                    expert_type,
                    tool_name,
                    task_id,
                    str(tool_args)[:200],
                )
            # 🔥🔥 关键：返回 messages 让 ToolNode 处理工具调用
            # 此时不生成 task.completed 事件，因为任务还没完成
            return {
                "messages": [response],  # 包含 tool_calls 的 AIMessage
                "task_list": task_list,
                "current_task_index": current_index,  # 不增加 index，等工具执行完再说
                "event_queue": initial_event_queue,  # 只返回 started 事件
                "__expert_info": {
                    "expert_type": expert_type,
                    "expert_name": expert_name,
                    "task_id": task_id,
                    "status": "waiting_for_tool",
                    "tool_calls": response.tool_calls,
                },
            }

        # 没有工具调用，正常完成任务
        logger.info("[GenericWorker] ℹ️ LLM 返回了普通文本响应，未调用工具")

        completed_at = datetime.now()
        duration_ms = int((completed_at - started_at).total_seconds() * 1000)

        logger.info(f"[GenericWorker] '{expert_type}' completed (耗时: {duration_ms / 1000:.2f}s)")

        # -------------------------------------------------------------
        # 🔥 新增逻辑：如果是记忆专家，执行"写入数据库"操作
        # -------------------------------------------------------------
        if expert_type == "memorize_expert":
            memory_content = response.content.strip()
            # 从 state 获取 user_id，默认使用 default_user
            user_id = state.get("user_id", "default_user")

            if memory_content:
                logger.info(f"[GenericWorker] 正在保存记忆: {memory_content}")
                try:
                    # 异步调用 memory_manager 保存 (内部使用了 to_thread)
                    await memory_manager.add_memory(
                        user_id=user_id,
                        content=memory_content,
                        source="conversation",
                        memory_type="fact",
                    )
                    logger.info("[GenericWorker] 记忆保存成功!")
                    # 修改返回给用户的 output，让反馈更自然
                    response_content_original = response.content
                    response.content = f"已为您记录：{response_content_original}"
                except (RuntimeError, ValueError) as mem_err:
                    logger.warning(f"[GenericWorker] 记忆保存失败: {mem_err}")
                    response.content = f"记录时遇到问题，但我会记住：{memory_content}"
        # -------------------------------------------------------------

        # 🔥 检测 artifact 类型
        artifact_type = _detect_artifact_type(response.content, expert_type)

        # ✅ v3.2 修复：增加 current_task_index 以支持循环
        # Generic Worker 执行完任务后，需要递增 index 才能执行下一个任务
        next_index = current_index + 1

        # 构造新的 task item + 新 task_list，避免对原状态做原地修改
        updated_task_list = replace_task_item(
            task_list,
            current_index,
            {
                "output_result": {"content": response.content},
                "status": "completed",
                "completed_at": completed_at.isoformat(),
            },
        )

        # ✅ 添加到 expert_results（用于后续任务依赖和最终聚合）
        # 🔥🔥🔥 关键修复：使用 task_id (Commander ID, 如 "task_0") 而不是 id (UUID)
        # 下游任务通过 depends_on: ["task_0"] 查找，必须用相同格式才能匹配
        semantic_id = current_task.get("task_id")  # Commander ID (如 "task_0")
        db_uuid = current_task.get("id")  # 数据库 UUID (如 "550e8400...")
        record_id = semantic_id if semantic_id else db_uuid  # 优先使用 semantic_id

        expert_result = {
            "task_id": record_id,  # 🔥 关键：使用 Commander ID 让下游能匹配到
            "db_uuid": db_uuid,  # 保留 UUID 方便调试
            "expert_type": expert_type,
            "description": description,
            "output": response.content,
            "status": "completed",
            "duration_ms": duration_ms,
        }

        logger.info(
            f"[GenericWorker] 保存专家结果: task_id={record_id}, db_uuid={db_uuid}, expert={expert_type}"
        )

        # 获取现有的 expert_results 并追加新结果
        expert_results = state.get("expert_results", [])
        expert_results = expert_results + [expert_result]

        # ✅ 构建 artifact 对象（符合 ArtifactCreate 模型）
        artifact = {
            "type": artifact_type,
            "title": f"{expert_name}结果",
            "content": response.content,
            "language": None,  # 可选字段，Pydantic 模型需要
            "sort_order": 0,  # 默认排序
            "artifact_id": artifact_id,
        }

        # ✅ 异步保存专家执行结果到数据库（P0 优化：不阻塞主流程）
        # 🔥 修复：不传递 db_session，在 async_save_expert_result 中创建独立的 Session
        if task_id:
            try:
                from utils.async_task_queue import async_save_expert_result

                # 使用后台线程异步保存，不阻塞 LLM 响应返回
                asyncio.create_task(
                    async_save_expert_result(
                        task_id=task_id,
                        expert_type=expert_type,
                        output_result=response.content,
                        artifact_data=artifact,
                        duration_ms=duration_ms,
                    )
                )
                logger.info(f"[GenericWorker] ✅ 专家执行结果已提交后台线程池保存: {expert_type}")
            except (RuntimeError, ValueError) as save_err:
                logger.warning(f"[GenericWorker] ⚠️ 后台保存提交失败: {save_err}")
        else:
            logger.warning(f"[GenericWorker] ⚠️ 跳过保存: task_id={task_id}")

        # ✅ 生成事件队列（用于前端展示专家和 artifact）
        from utils.event_generator import (
            event_artifact_generated,
            event_task_completed,
            sse_event_to_string,
        )

        # 🔥 v4.0 重构：统一发送 artifact.generated 事件（批处理模式）
        # 所有专家完成后发送完整的 artifact 内容
        artifact_event = event_artifact_generated(
            task_id=task_id,
            expert_type=expert_type,
            artifact_id=artifact_id,
            artifact_type=artifact_type,
            content=response.content,
            title=f"{expert_name}结果",
        )
        logger.info(f"[GenericWorker] 已生成 artifact.generated 事件: {artifact_type}")

        # 1. 发送 task.completed 事件（专家执行完成）
        task_completed_event = event_task_completed(
            task_id=task_id,
            expert_type=expert_type,
            description=description,
            output=response.content[:500] + "..."
            if len(response.content) > 500
            else response.content,
            duration_ms=duration_ms,
            artifact_count=1,
        )
        logger.info(f"[GenericWorker] 已生成 task.completed 事件: {expert_type}")

        # ✅ 合并 started / artifact.generated / task.completed 事件（不可变）
        full_event_queue = append_sse_event(
            initial_event_queue, sse_event_to_string(artifact_event)
        )
        full_event_queue = append_sse_event(
            full_event_queue,
            sse_event_to_string(task_completed_event),
        )

        return {
            "messages": [
                response
            ],  # 🔥🔥🔥 核心修复：必须把 LLM 的最终回复更新到图状态的消息历史中！🔥🔥🔥
            "task_list": updated_task_list,
            "expert_results": expert_results,
            "current_task_index": next_index,  # ✅ 增加 index
            "output_result": response.content,
            "status": "completed",
            "started_at": started_at.isoformat(),
            "completed_at": completed_at.isoformat(),
            "duration_ms": duration_ms,
            "artifact": artifact,
            "event_queue": full_event_queue,  # ✅ 添加完整事件队列（包含 started 和 completed）
            # ✅ 添加 __expert_info 用于 chat.py 识别和收集 artifacts
            "__expert_info": {
                "expert_type": expert_type,
                "expert_name": expert_name,
                "task_id": task_id,
                "status": "completed",
                "artifact_id": artifact_id,  # 🔥 包含 artifact_id
            },
        }

    except Exception as e:
        if isinstance(e, ExpertExecutionError):
            logger.warning(f"[GenericWorker] '{expert_type}' 执行异常: {e}")
        else:
            logger.warning(f"[GenericWorker] '{expert_type}' failed: {e}")

        # ✅ 失败时也要增加 index，否则会卡死循环
        next_index = current_index + 1

        # 构造新的 task item + 新 task_list，避免原地修改
        failed_task_list = replace_task_item(
            task_list,
            current_index,
            {
                "status": "failed",
            },
        )

        # 获取现有的 expert_results 并添加失败记录
        expert_results = state.get("expert_results", [])
        # 🔥🔥🔥 关键修复：使用 task_id (Commander ID) 而不是 id (UUID)
        semantic_id = current_task.get("task_id")
        db_uuid = current_task.get("id")
        task_id = semantic_id if semantic_id else db_uuid
        expert_result = {
            "task_id": task_id,  # 🔥 使用 Commander ID
            "db_uuid": db_uuid,  # 保留 UUID
            "expert_type": expert_type,
            "description": description,
            "output": f"专家执行失败: {str(e)}",
            "status": "failed",
            "error": str(e),
            "duration_ms": 0,
        }
        expert_results = expert_results + [expert_result]

        # ✅ 生成 task.failed 事件
        from utils.event_generator import event_task_failed, sse_event_to_string

        failed_event = event_task_failed(
            task_id=task_id, expert_type=expert_type, description=description, error=str(e)
        )
        logger.info(f"[GenericWorker] 已生成 task.failed 事件: {expert_type}")

        # ✅ 合并 started 事件和 failed 事件（不可变）
        full_event_queue = append_sse_event(initial_event_queue, sse_event_to_string(failed_event))

        return {
            "task_list": failed_task_list,
            "expert_results": expert_results,
            "current_task_index": next_index,  # ✅ 即使失败也增加 index
            "output_result": f"专家执行失败: {str(e)}",
            "status": "failed",
            "error": str(e),
            "started_at": started_at.isoformat(),
            "completed_at": datetime.now().isoformat(),
            "event_queue": full_event_queue,  # ✅ 添加完整事件队列（包含 started 和 failed）
            # ✅ 添加 __expert_info 用于标识失败的专家
            "__expert_info": {
                "expert_type": expert_type,
                "expert_name": expert_config.get("name", expert_type)
                if expert_config
                else expert_type,
                "task_id": task_id,
                "status": "failed",
                "error": str(e),
            },
        }


def _format_input_data(data: dict) -> str:
    """格式化输入数据为文本"""
    if not data:
        return "（无额外参数）"

    lines = []
    for key, value in data.items():
        if isinstance(value, list | dict):
            lines.append(f"- {key}: {value}")
        else:
            lines.append(f"- {key}: {value}")

    return "\n".join(lines)


def _detect_artifact_type(content: str, expert_key: str) -> str:
    """
    检测 artifact 类型

    简化版，默认返回 "text"，但会尝试检测 HTML 和 Markdown 内容。
    """
    content_lower = content.lower().strip()

    # 1. HTML 检测
    if (
        content_lower.startswith("<!doctype html")
        or content_lower.startswith("<html")
        or ("<html" in content_lower and "</html>" in content_lower)
    ):
        return "html"

    # 检测 HTML 代码块
    html_code_block = re.search(r"```html\n([\s\S]*?)```", content, re.IGNORECASE)
    if html_code_block:
        return "html"

    # 2. Markdown 检测
    has_markdown = any(marker in content for marker in ["# ", "## ", "### ", "> ", "- ", "* "])
    has_code_block = "```" in content

    if has_markdown or has_code_block:
        return "markdown"

    # 3. 默认返回 text
    return "text"
