"""
Expert Worker 节点 - 单个专家任务的执行（跑在 `agents/expert_worker.py` 子图内）

[职责]
执行**一个**专家任务，支持：
- 专家配置动态加载（数据库 + 缓存）
- 工具调用（Function Calling，与 tools 节点构成分支内的循环）
- 批处理 Artifact 交付（完成后全量推送）
- 上下文组装（上游依赖输出由父图解析后经 Send payload 注入）

[执行流程]
1. 从 Send payload 取本分支的任务（`current_task`）与上游输出（`dependency_outputs`）
2. 加载专家配置（system_prompt, model, temperature）
3. 组装上下文（系统提示 + 上游任务输出 + 当前任务输入）
4. 调用 LLM（批处理模式）
5. 处理工具调用（如有）→ 交给同子图的 `tools` 节点，再回到本节点
6. 生成 Artifact（代码/文档/HTML）- 批处理交付
7. 发 task.completed / task.failed 事件 + 写运行事件账本
8. 产出 **outcome**（见 `agents/task_outcome.py`）交回主图

[为什么不再直接写 task_list / expert_results]
主图按依赖波次把同层任务**并发**扇出（Send），并发写无 reducer 的通道会直接
InvalidUpdateError；而 task_list 又必须支持计划编辑的「整表替换」。于是产物统一
走 `task_outcomes`（有 reducer，按 key 合并），由 `wave_scheduler` 的 join 落状态。

[分支私有草稿]
工具循环的消息留在子图的 `worker_messages`，不进主图 `messages`（会话历史）。
顺带一个真实收益：工具循环守卫因此只看**本任务**的工具调用，不再把历史会话里
别的任务的工具往返算进来（此前会误熔断）。

[依赖注入]
- 依赖输出由父图在扇出前解析好（Send payload），分支读不到主图状态
- 缺失依赖时容错处理（提示 LLM 尽力完成）

[错误处理]
- 专家配置不存在：产出 failed 的 outcome
- LLM 调用异常/超时：产出 failed 的 outcome（**只让本任务失败，其余任务照常**）

[状态更新]
- 产出 outcome → 由 join 落成 task_list / expert_results
- 事件：task.started / task.completed / task.failed / artifact.generated

v3.7 优化: P0 修复 + TTLCache 本地内存缓存高频查询
C2（2026-09-13）: 从「主图节点 + current_task_index 游标」改为「执行子图内的分支节点」
"""

import asyncio
import json
import re
from typing import Any

from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.runnables import RunnableConfig

from agents.event_stream import emit_event
from agents.plan_waves import task_key
from agents.routing_policy import should_trip_tool_loop_guard
from agents.services.expert_manager import get_expert_config_cached
from agents.task_outcome import DEPENDENCY_CONTEXT_LIMIT, build_task_outcome
from agents.tool_policy import filter_tools_for_binding, get_builtin_tool_names
from config import settings
from event_types.events import TaskFailedData, TaskStartedData
from models.enums import GraphTaskStatus
from providers_config import get_model_config, load_providers_config
from services.memory_manager import memory_manager  # 🔥 导入记忆管理器
from services.tool_policy_service import tool_policy_service
from tools import ASYNC_TOOLS as BASE_TOOLS  # 🔥 MCP: 导入基础工具集（异步版，避免阻塞事件循环）
from utils.artifacts import strip_code_fence
from utils.config_cache import ConfigCache
from utils.llm_factory import get_effective_model, get_expert_llm
from utils.logger import logger
from utils.prompt_utils import enhance_system_prompt_with_tools  # v3.6: 提取到工具函数
from utils.time import utc_now

# P0 优化: 本地内存缓存高频专家配置查询 (5分钟TTL, 最大200条)
_generic_expert_cache = ConfigCache(maxsize=200, ttl=300, name="generic_expert")


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


async def expert_worker_node(
    state: dict[str, Any], config: RunnableConfig = None, llm=None
) -> dict[str, Any]:
    """
    专家执行节点（执行子图内的分支节点）

    根据 Send payload 注入的 `current_task` 从数据库加载专家配置并执行。

    支持工具调用流程：
    1. 首次调用：LLM 可能返回 tool_calls
    2. 工具执行后（同子图的 tools 节点）：LLM 看到 ToolMessage，生成最终回复

    🔥 v4.0 重构：批处理模式
    - 所有专家统一使用 ainvoke 等待完整响应
    - Artifact 在 task.completed 事件中全量推送
    - 简化架构，避免流式同步问题

    Args:
        state: 分支状态，含 current_task / dependency_outputs / worker_messages 等
        llm: 可选的 LLM 实例，如果不提供则根据专家配置创建

    Returns:
        Dict: 分支状态更新（草稿消息 + worker_started + task_outcomes）
    """
    from langchain_core.messages import ToolMessage

    # 本分支的任务 / 上游输出 / 运行标识都来自 Send payload（分支读不到主图其它通道）
    current_task = state.get("current_task") or {}
    dependency_outputs = state.get("dependency_outputs") or {}
    branch_context = state.get("branch_context") or {}
    existing_messages = state.get("worker_messages", [])

    if not current_task:
        # Send payload 没注入任务 = 接线错了。必须炸出来：静默返回会让这个分支
        # 无声消失（计划少跑一个任务却报成功）。
        raise GenericWorkerError("expert_worker 分支缺少 current_task（Send payload 未注入）")

    expert_type = current_task.get("expert_type", "")
    description = current_task.get("description", "")
    input_data = current_task.get("input_data", {})

    if not expert_type:
        # 任务本身不合法（LLM 规划出的残缺项）：产出失败产物，不炸整轮
        outcome = build_task_outcome(
            current_task,
            status=GraphTaskStatus.FAILED,
            output="任务缺少 expert_type 字段",
            error="Missing expert_type in task",
            started_at=utc_now().isoformat(),
            completed_at=utc_now().isoformat(),
        )
        return {"worker_started": True, "task_outcomes": {outcome["task_key"]: outcome}}

    # P0 修复 + 优化: 优先使用本地内存缓存，缓存未命中才查数据库
    # 任务级失败隔离：配置获取（内含 DB 会话）也属于「外部基础设施」，抖动时
    # 只失败本任务，绝不允许异常冲出节点把同波兄弟任务连带拖死（评审 H1）。
    try:
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
    except Exception as config_err:
        logger.error(
            "[GenericWorker] ❌ 加载专家配置失败（只失败本任务）: expert=%s err=%s",
            expert_type,
            config_err,
            exc_info=True,
        )
        outcome = build_task_outcome(
            current_task,
            status=GraphTaskStatus.FAILED,
            output=f"加载专家 '{expert_type}' 配置失败",
            error=f"Failed to load expert config: {config_err}",
            started_at=utc_now().isoformat(),
            completed_at=utc_now().isoformat(),
        )
        return {"worker_started": True, "task_outcomes": {outcome["task_key"]: outcome}}

    if not expert_config:
        outcome = build_task_outcome(
            current_task,
            status=GraphTaskStatus.FAILED,
            output=f"专家 '{expert_type}' 未找到",
            error=f"Expert '{expert_type}' not found in database",
            started_at=utc_now().isoformat(),
            completed_at=utc_now().isoformat(),
        )
        return {"worker_started": True, "task_outcomes": {outcome["task_key"]: outcome}}

    started_at = utc_now()

    task_id = current_task.get("id") or task_key(current_task)

    # ✅ 发送 task.started 事件（仅任务首次进入时；工具循环重入不再重复发）
    from utils.event_generator import event_task_started

    # 「首次进入」由分支私有的 worker_started 表达（此前借 task_list 里的
    # in_progress 标记——那是主图状态，分支里已没有它可写）
    is_first_entry = not state.get("worker_started")
    run_id = branch_context.get("run_id")
    thread_id = branch_context.get("thread_id")
    execution_plan_id = branch_context.get("execution_plan_id")
    # 本任务的专家消息 id（task.started 时插入；完成/失败分支原位更新它）
    expert_message_id: int | None = None

    if is_first_entry:
        # 专家执行消息（真相源=消息表）：先插入 running 态拿到 message_id，
        # 事件才能携带它——前端据此外加同一条消息，刷新直接从库读。
        # 同步等待插入：事件语义是「收到即可查」，单行 INSERT 的量级。
        if thread_id:
            try:
                from services.chat.expert_message import insert_expert_message_standalone

                expert_message_id = await asyncio.to_thread(
                    insert_expert_message_standalone,
                    thread_id=thread_id,
                    task_id=str(task_id),
                    expert_type=expert_type,
                    description=description,
                    sort_order=int(current_task.get("sort_order") or 0),
                    total_steps=int(branch_context.get("total_steps") or 0),
                    run_id=run_id,
                )
            except Exception as msg_err:
                logger.warning(f"[GenericWorker] ⚠️ 专家消息插入失败（不影响执行）: {msg_err}")
        await emit_event(
            event_task_started(
                task_id=task_id,
                expert_type=expert_type,
                description=description,
                message_id=expert_message_id,
                sort_order=int(current_task.get("sort_order") or 0),
                total_steps=int(branch_context.get("total_steps") or 0) or None,
            )
        )
        logger.info(f"[GenericWorker] 已生成 task.started 事件: {expert_type}")

        # 账本写入同样只在首次进入时做。此前这段在 guard **之外**，于是工具循环每
        # 重入本节点一次就多写一行 task_started（实测一个任务两行，任务控制页时间线
        # 重复显示；前端靠按 task_id 去重所以聊天界面看不出来）。
        if run_id and thread_id:
            try:
                from utils.async_task_queue import async_append_run_event, spawn_background

                spawn_background(
                    async_append_run_event(
                        run_id=run_id,
                        event_type="task_started",
                        thread_id=thread_id,
                        execution_plan_id=execution_plan_id,
                        task_id=str(current_task.get("id", task_id)),
                        event_data=TaskStartedData(
                            task_id=str(current_task.get("id", task_id)),
                            expert_type=expert_type,
                            description=description,
                            started_at=utc_now().isoformat(),
                        ).model_dump(),
                    ),
                    label=f"run_event:task_started:{expert_type}",
                )
            except (RuntimeError, ValueError) as event_err:
                logger.warning(f"[GenericWorker] ⚠️ task_started 账本写入提交失败: {event_err}")

        # 任务开始时刻落库（SubTask.started_at）。此前这一列**永远是 NULL**：收尾时
        # save_expert_execution_result 只写 completed_at/duration_ms，没有开始时刻，
        # 于是"哪个任务慢、卡了多久"只能靠事件账本反推，直接查库看不到。
        # 同样只在首次进入时做（工具循环重入不得重打时间戳），且走后台线程——
        # 节点跑在事件循环里，一次 DB 写不该阻塞流式输出。
        if task_id:
            try:
                from utils.async_task_queue import async_mark_subtask_running, spawn_background

                spawn_background(
                    async_mark_subtask_running(str(task_id)),
                    label=f"subtask_running:{expert_type}:{task_id}",
                )
            except (RuntimeError, ValueError) as mark_err:
                logger.warning(f"[GenericWorker] ⚠️ 任务开始时刻落库提交失败: {mark_err}")

    # 本分支的固定返回：标记已启动（防 started 重发）+ 产出失败产物时的收口
    base_return: dict[str, Any] = {"worker_started": True}

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

        # ---------------------------------------------------------------------------
        # 工具收集（在 System Prompt 增强之前：清单要注入 prompt，专家才"知道"
        # 自己有哪些 MCP 工具可用——bind_tools 只给 schema，认知靠 prompt）
        # ---------------------------------------------------------------------------
        # 工具循环守卫：此前在路由函数里「熔断 → 直接跳 aggregator」，等于一个任务
        # 的工具失控会**终结整轮计划**（其余任务不再执行），而且它数的是全会话历史里
        # 的工具往返，别的任务的调用会把本任务误判成循环。现在收敛到分支内、只看本
        # 任务：熔断 = 本任务不再绑工具，让模型基于已有信息收尾，其余任务照常。
        guard_tripped, guard_reason = should_trip_tool_loop_guard(existing_messages)
        if guard_tripped:
            logger.warning(
                "[GenericWorker] 工具循环熔断：%s（任务 %s 转入无工具收尾）", guard_reason, task_id
            )

        # 熔断 = 本任务转入无工具收尾：模型基于已获得的工具结果直接作答，
        # 其余任务照常（评审 H3：恢复多轮工具循环后，这里就是循环的有界性来源之一）
        finish_only = guard_tripped

        # ENABLE_TOOL_CALLING=false 可禁用工具调用（平滑升级兼容）
        enable_tools = settings.enable_tool_calling and not finish_only
        bindable_tools: list = []
        builtin_names: set[str] = set()
        if enable_tools:
            # 工具集的收集与治理过滤**不放在宽 try 里**——它们读的是 DB 配置
            # （工具治理覆盖）与注入的 MCP 工具，失败属程序/数据层问题。
            # 此前整段被一个 `except Exception` 包住降级为「无工具执行」，
            # 于是 tool_policy_service 的时区比较异常（naive vs aware）被
            # 吞成一句误导性警告，**所有专家的工具调用静默失效数月**。
            # 现在这类错误直接上抛（失败可见），只有「模型确实不支持工具
            # 调用」才允许降级。
            # 🔥 MCP: 从 config 获取动态注入的工具
            mcp_tools = []
            if config and hasattr(config, "get"):
                mcp_tools = config.get("configurable", {}).get("mcp_tools", [])

            # 🔥 MCP: 合并基础工具和动态 MCP 工具
            runtime_tools = list(BASE_TOOLS) + list(mcp_tools)
            policy_overrides = await tool_policy_service.get_overrides()
            bindable_tools, blocked_tools = filter_tools_for_binding(
                runtime_tools,
                expert_type=expert_type,
                overrides=policy_overrides,
            )
            builtin_names = get_builtin_tool_names()

            # 🔥 警告：如果 MCP 工具为空但预期应该有
            if not mcp_tools and settings.mcp_servers:
                logger.warning("[GenericWorker] ⚠️ MCP 工具为空！请检查 MCP 服务器连接")

            try:
                llm_to_use = llm_with_config.bind_tools(bindable_tools)
            except (NotImplementedError, TypeError) as bind_err:
                # 仅「该模型实例不支持绑定工具」这一情形可降级：无工具但仍能对话。
                logger.error(
                    "[GenericWorker] ⚠️ 模型不支持工具调用，专家将**无工具**执行: %s",
                    bind_err,
                    exc_info=True,
                )
                llm_to_use = llm_with_config
            else:
                logger.info(
                    "[GenericWorker] 🔧 工具已绑定: %s 个工具 (基础: %s, MCP: %s, 被治理层过滤: %s)",
                    len(bindable_tools),
                    len(BASE_TOOLS),
                    len(mcp_tools),
                    len(blocked_tools),
                )
                for blocked in blocked_tools:
                    logger.info(
                        "[GenericWorker] 工具未暴露给当前 expert | expert=%s tool=%s action=%s reason=%s",
                        expert_type,
                        blocked.tool_name,
                        blocked.action,
                        blocked.reason,
                    )
        elif finish_only:
            logger.info("[GenericWorker] 🔒 工具已熔断，本任务转无工具收尾: %s", task_id)
            llm_to_use = llm_with_config
        else:
            logger.info("[GenericWorker] ⏭️ 工具调用已禁用（ENABLE_TOOL_CALLING=false）")
            llm_to_use = llm_with_config

        # 🔥🔥🔥 GenericWorker 2.0: 占位符填充 + System Prompt 增强
        # 填充 {input} 占位符（任务描述）
        if "{input}" in system_prompt:
            system_prompt = system_prompt.replace("{input}", description)
            logger.info(f"[GenericWorker] 已注入占位符: {{input}} = {description[:50]}...")

        # 增强 System Prompt (注入时间 + 本次绑定的工具清单与选择指引)
        enhanced_system_prompt = enhance_system_prompt_with_tools(
            system_prompt,
            bindable_tools=bindable_tools if enable_tools else None,
            builtin_names=builtin_names,
        )

        # 🔥 关键修复（v3.4.4）：仅当最后一条是 ToolMessage（工具续跑）时才沿用
        # 现有 messages；否则一律走首次执行分支（任务描述 + 依赖上下文进 prompt）。
        # 此前条件是 `if existing_messages:`——聊天历史恒非空，导致多任务执行时
        # 任务描述/依赖上下文从未进入 prompt，同专家的每个任务都在回答原始请求
        # （表现为多个任务的 artifact 内容雷同）。
        # 注：现在的 `existing_messages` 是**本分支**的工具草稿（不再是全会话历史），
        # 所以「恒非空」这个坑在本分支里天然不存在；判断逻辑保持不变以防回归。
        has_tool_message = bool(existing_messages) and isinstance(
            existing_messages[-1], ToolMessage
        )

        if has_tool_message:
            # 工具重入：沿用分支草稿（AIMessage(tool_calls) + ToolMessage），
            # 让 LLM 看到已经拿到的工具结果
            normalized_existing = normalize_messages_for_llm(existing_messages, content_mode)

            messages_for_llm = [
                SystemMessage(content=enhanced_system_prompt),
                *normalized_existing,  # 包含 AIMessage(tool_calls) 和 ToolMessage
            ]
        else:
            # 首次调用：创建新的消息列表
            # 🔥🔥🔥 智能上下文组装：处理依赖缺失的情况
            # 上游输出由父图在扇出前解析好放进 Send payload（分支读不到主图状态），
            # 所以这里是纯粹的 payload 查询，不再扫 expert_results。
            depends_on = current_task.get("depends_on", [])

            # 构建上下文提示
            context_parts = []
            missing_deps = []

            if depends_on:
                for dep_id in depends_on:
                    dep_output = dependency_outputs.get(str(dep_id))
                    if dep_output:
                        context_parts.append(
                            # 截断上限同源 task_outcome.DEPENDENCY_CONTEXT_LIMIT
                            # （Send payload 在 wave_scheduler 已按同一上限裁过，
                            # 这里是防御性第二刀）
                            f"【上游任务 {dep_id} 的输出】:\n{dep_output[:DEPENDENCY_CONTEXT_LIMIT]}..."
                        )
                        logger.info(f"[GenericWorker] ✅ 找到依赖 {dep_id}: {len(dep_output)} 字符")
                    else:
                        missing_deps.append(dep_id)
                        logger.warning(
                            f"[GenericWorker] ⚠️ 未找到依赖 {dep_id}, 可用依赖: {list(dependency_outputs)}"
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

        # 熔断收尾：在消息末尾追加显式指令，让模型停止发起工具调用、直接作答。
        # （has_tool_message 本身**不再**注入「不要再调用工具」——那是单轮时代的
        # 写法；多轮循环下模型自然决定是否继续调用工具。）
        if guard_tripped:
            messages_for_llm.append(
                HumanMessage(
                    content=(
                        f"[系统提示：工具调用已被熔断（{guard_reason}）。"
                        "不要再调用任何工具，请基于已经获得的信息直接给出最终答复]"
                    )
                )
            )

        # 🔥🔥🔥 v4.0 重构：统一使用批处理模式
        # 所有专家统一使用 ainvoke 等待完整响应
        # Artifact 在 task.completed 事件中全量推送
        try:
            # [DIAG] prompt 组装诊断（debug 级；排查多任务 prompt 组装时开启）
            for _mi, _m in enumerate(messages_for_llm):
                logger.debug(
                    "[GenericWorker][DIAG] prompt[%d/%d] %s: %s",
                    _mi + 1,
                    len(messages_for_llm),
                    _m.type,
                    str(_m.content)[:600],
                )
            # LLM 调用加超时：模型端悬挂时本次调用不会无限 await（此前的表现是
            # 一直挂着，只能等 run 级 deadline 或后台清理兜底才发现）。超时按
            # **任务级**失败处理（ExpertExecutionError → task.failed），其余任务
            # 照常执行；这也是为什么不用节点级 TimeoutPolicy——那会杀掉整轮。
            async with asyncio.timeout(settings.llm_call_timeout_seconds):
                response = await llm_to_use.ainvoke(
                    messages_for_llm,
                    config=RunnableConfig(
                        tags=["expert", expert_type, "generic_worker"],
                        metadata={"node_type": "expert", "expert_type": expert_type},
                    ),
                )
            logger.info(
                "[GenericWorker][DIAG] response: len=%d head=%r",
                len(response.content or ""),
                str(response.content)[:60],
            )

            # 🔥 B5 用量记账：本次专家调用的 usage 增量累加到 run
            # （后台线程独立 Session，SQL 层累加防读改写竞态）
            usage_meta = getattr(response, "usage_metadata", None) or {}
            task_usage = {
                "prompt": int(usage_meta.get("input_tokens") or 0),
                "completion": int(usage_meta.get("output_tokens") or 0),
            }
            if run_id and (task_usage["prompt"] or task_usage["completion"]):
                try:
                    from crud.agent_run import add_run_token_usage
                    from utils.async_task_queue import spawn_background

                    spawn_background(
                        asyncio.to_thread(
                            add_run_token_usage,
                            run_id,
                            task_usage["prompt"],
                            task_usage["completion"],
                        ),
                        label=f"token_usage:{task_id}",
                    )
                except (RuntimeError, ValueError) as usage_err:
                    logger.warning("[GenericWorker] ⚠️ 用量记账提交失败: %s", usage_err)
        except TimeoutError as exc:
            # asyncio.timeout 触发的模型悬挂（此分支此前因无超时包裹而不可达，
            # 已随超时的引入重新变为有效路径）
            raise ExpertExecutionError(
                f"LLM 调用超时（{settings.llm_call_timeout_seconds:.0f}s 未返回）"
            ) from exc
        except Exception as exc:
            raise ExpertExecutionError(f"LLM 调用失败: {exc}") from exc

        # 生成 artifact_id
        import uuid

        artifact_id = str(uuid.uuid4())

        # 🔥 关键修复：检查响应中是否包含工具调用
        has_tool_calls = hasattr(response, "tool_calls") and response.tool_calls

        if has_tool_calls and guard_tripped:
            # 已经给过「无工具收尾」的机会，模型仍要调工具 → 本任务失败。
            # 只失败本任务（其余任务照常），且失败原因写清是熔断而非模型报错。
            raise ExpertExecutionError(f"工具调用陷入循环（{guard_reason}），已中止该任务")

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
            # 🔥🔥 关键：返回分支草稿消息，由同子图的 tools 节点执行工具调用
            # 此时不生成 task.completed 事件（任务还没完成），也不产出 outcome
            return {**base_return, "worker_messages": [response]}

        # 没有工具调用，正常完成任务
        logger.info("[GenericWorker] ℹ️ LLM 返回了普通文本响应，未调用工具")

        completed_at = utc_now()
        duration_ms = int((completed_at - started_at).total_seconds() * 1000)

        logger.info(f"[GenericWorker] '{expert_type}' completed (耗时: {duration_ms / 1000:.2f}s)")

        # -------------------------------------------------------------
        # 🔥 新增逻辑：如果是记忆专家，执行"写入数据库"操作
        # -------------------------------------------------------------
        if expert_type == "memorize_expert":
            memory_content = response.content.strip()
            # user_id 由 Send payload 的 branch_context 带过来，默认 default_user
            user_id = branch_context.get("user_id") or "default_user"

            # 教材约定「一行一条记忆、无值得记录时只输出：无」（见
            # expert_config.memorize_expert）——逐行入库（分条存储检索精度更高），
            # 「无」/空行不是记忆，跳过。曾把整段输出（含 JSON 数组形态的
            # 结构包裹）当一条 content 存：结构字段无人承接，空数组 [] 也是垃圾记忆。
            memory_lines = [
                ln.strip()
                for ln in memory_content.splitlines()
                if ln.strip() and ln.strip() != "无"
            ]
            if memory_lines:
                logger.info(f"[GenericWorker] 正在保存 {len(memory_lines)} 条记忆")
                try:
                    for line in memory_lines:
                        await memory_manager.add_memory(
                            user_id=user_id,
                            content=line,
                            source="conversation",
                            memory_type="fact",
                        )
                    logger.info("[GenericWorker] 记忆保存成功!")
                    response.content = "已为您记录：\n" + "\n".join(memory_lines)
                except (RuntimeError, ValueError) as mem_err:
                    logger.warning(f"[GenericWorker] 记忆保存失败: {mem_err}")
                    response.content = f"记录时遇到问题，但我会记住：{memory_content}"
            else:
                response.content = "本次对话没有需要记住的内容。"
        # -------------------------------------------------------------

        # 🔥 输出截断检测：finish_reason=length 说明内容被 max_tokens 掐断，
        # artifact 可能只有半截（如 HTML 只生成了 <head>，预览整页空白）
        finish_reason = (getattr(response, "response_metadata", None) or {}).get("finish_reason")
        if finish_reason == "length":
            logger.warning(
                "[GenericWorker] ⚠️ LLM 输出被 max_tokens 截断 (finish_reason=length)，"
                "artifact 可能不完整: expert=%s len=%d",
                expert_type,
                len(response.content or ""),
            )

        # 🔥 检测 artifact 类型
        artifact_type = _detect_artifact_type(response.content, expert_type)

        # ✅ 构建 artifact 对象（符合 ArtifactCreate 模型）
        artifact_title = _artifact_title_from_output(response.content, f"{expert_name}结果")
        artifact = {
            "type": artifact_type,
            "title": artifact_title,
            # 模型常用 ```html:index.html 的围栏给产物命名——原样入库会把围栏
            # 头尾渲染进 HTML 预览（页面顶部出现文件名、底部多一行 ```）。
            # 剥掉「包裹整体的围栏」，正文内部的代码块不动。
            "content": strip_code_fence(response.content),
            "language": None,  # 可选字段，Pydantic 模型需要
            "sort_order": 0,  # 默认排序
            "artifact_id": artifact_id,
        }

        # ✅ 产出 outcome：交回主图（由 wave_scheduler 的 join 落成 task_list /
        # expert_results）。task_key 用 commander 语义 id——下游 depends_on 引用的是它。
        outcome = build_task_outcome(
            current_task,
            status=GraphTaskStatus.COMPLETED,
            output=response.content,
            duration_ms=duration_ms,
            started_at=started_at.isoformat(),
            completed_at=completed_at.isoformat(),
            artifact=artifact,
        )
        logger.info(
            f"[GenericWorker] 产出任务结果: task_key={outcome['task_key']}, "
            f"db_uuid={outcome['db_uuid']}, expert={expert_type}"
        )

        # ✅ 异步保存专家执行结果到数据库（P0 优化：不阻塞主流程）
        # 🔥 修复：不传递 db_session，在 async_save_expert_result 中创建独立的 Session
        if task_id:
            try:
                from utils.async_task_queue import async_save_expert_result, spawn_background
                from utils.event_generator import event_artifact_generated

                # artifact.generated 事件交给保存协程，在**落库成功之后**发射：
                # 前端收到事件会立即拉 /artifacts 列表（右栏画布实时出卡），
                # 先发后存会让那次刷新扑空——产物要等下一次事件或手动整页刷新
                # 才出现。跳过保存（task_id 为空）时同样不发：没落库就不该宣称已生成。
                artifact_event = event_artifact_generated(
                    task_id=task_id,
                    expert_type=expert_type,
                    artifact_id=artifact_id,
                    artifact_type=artifact_type,
                    content=response.content,
                    title=artifact_title,
                )
                # task.completed 事件同样交给保存协程：先更新专家消息（产物引用/
                # 工具统计）再发射——事件载荷即消息终态，前端「收到即可查」，
                # 与 artifact_event 同一条时序纪律（旧实现在协程之前发事件，
                # 前端拿到时消息还是 running 态）。
                from utils.event_generator import event_task_completed

                task_completed_event = event_task_completed(
                    task_id=task_id,
                    expert_type=expert_type,
                    description=description,
                    output=response.content[:500] + "..."
                    if len(response.content) > 500
                    else response.content,
                    duration_ms=duration_ms,
                    artifact_count=1,
                    artifact_ids=[artifact_id],
                )
                # 使用后台线程异步保存，不阻塞 LLM 响应返回（持引用防 GC + 失败可见）
                spawn_background(
                    async_save_expert_result(
                        task_id=task_id,
                        expert_type=expert_type,
                        output_result=response.content,
                        artifact_data=artifact,
                        duration_ms=duration_ms,
                        artifact_event=artifact_event,
                        task_completed_event=task_completed_event,
                        artifact_id=artifact_id,
                        thread_id=thread_id,
                        run_id=run_id,
                    ),
                    label=f"save_result:{expert_type}:{task_id}",
                )
                logger.info(f"[GenericWorker] ✅ 专家执行结果已提交后台线程池保存: {expert_type}")
            except (RuntimeError, ValueError) as save_err:
                logger.warning(f"[GenericWorker] ⚠️ 后台保存提交失败: {save_err}")
        else:
            logger.warning(f"[GenericWorker] ⚠️ 跳过保存: task_id={task_id}")

        return {
            **base_return,
            # 分支草稿：本任务的最终回复（主图 messages 由 aggregator 追加综述，
            # 不在这里写——N 个并发分支往会话历史里写会让顺序变成完成顺序）
            "worker_messages": [response],
            "task_outcomes": {outcome["task_key"]: outcome},
        }

    except Exception as e:
        if isinstance(e, ExpertExecutionError):
            logger.warning(f"[GenericWorker] '{expert_type}' 执行异常: {e}")
        else:
            logger.warning(f"[GenericWorker] '{expert_type}' failed: {e}")

        # 失败也只影响本任务：产出 failed 的 outcome，其余任务照常（并发下互不影响）。
        # 此前这里还要「推进游标以防死循环」——游标已随 C2 移除，不再需要。
        db_uuid = current_task.get("id")
        # 事件/账本里的 task_id 沿用 db uuid 口径（前端按它关联任务行）
        task_id = db_uuid or task_key(current_task)
        outcome = build_task_outcome(
            current_task,
            status=GraphTaskStatus.FAILED,
            output=f"专家执行失败: {str(e)}",
            error=str(e),
            started_at=started_at.isoformat(),
            completed_at=utc_now().isoformat(),
        )

        # 专家消息原位更新为 failed（后台线程；消息表=执行状态真相源）
        if thread_id:
            try:
                from services.chat.expert_message import fail_expert_message_standalone

                await asyncio.to_thread(
                    fail_expert_message_standalone,
                    thread_id=thread_id,
                    task_id=str(task_id),
                    error=str(e),
                )
            except Exception as msg_err:
                logger.warning(f"[GenericWorker] ⚠️ 专家消息失败更新失败: {msg_err}")

        # ✅ 生成 task.failed 事件
        from utils.event_generator import event_task_failed

        await emit_event(
            event_task_failed(
                task_id=task_id,
                expert_type=expert_type,
                description=description,
                error=str(e),
                message_id=expert_message_id,
            )
        )
        logger.info(f"[GenericWorker] 已生成 task.failed 事件: {expert_type}")

        if run_id and thread_id:
            try:
                from utils.async_task_queue import async_append_run_event, spawn_background

                spawn_background(
                    async_append_run_event(
                        run_id=run_id,
                        event_type="task_failed",
                        thread_id=thread_id,
                        execution_plan_id=execution_plan_id,
                        task_id=str(task_id),
                        event_data=TaskFailedData(
                            task_id=str(task_id),
                            expert_type=expert_type,
                            description="",
                            error=str(e),
                            failed_at=utc_now().isoformat(),
                        ).model_dump(),
                    ),
                    label=f"run_event:task_failed:{expert_type}",
                )
            except (RuntimeError, ValueError) as event_err:
                logger.warning(f"[GenericWorker] ⚠️ task_failed 账本写入提交失败: {event_err}")

        return {
            **base_return,
            "task_outcomes": {outcome["task_key"]: outcome},
        }


def _format_input_data(data: dict) -> str:
    """格式化输入数据为文本"""
    if not data:
        return "（无额外参数）"

    return "\n".join(f"- {key}: {value}" for key, value in data.items())


def _artifact_title_from_output(content: str, fallback: str, max_len: int = 80) -> str:
    """产物标题的提取规则（title 单一真相源在落库处，画廊/产物卡/预览/
    下载文件名全部从这里读，不在展示层重复推导）：

    1. 优先第一个 markdown 标题行（`#`/`##`…）——报告的正式标题；
    2. 无标题行时，首非空行**仅当短（≤40 字符）且不含句读**才采用
       （形如短语/文件名）；模型过渡句（"I have sufficient information.
       Let me compile…"）特征就是完整长句，必须兜底；
    3. 兜底「{专家}结果」。
    """
    first_line = ""
    for line in (content or "").splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("#"):
            cleaned = stripped.lstrip("#").strip()
            if cleaned:
                return cleaned[:max_len]
        if not first_line:
            first_line = stripped
    if first_line:
        candidate = first_line.strip("*").strip()
        if (
            candidate
            and len(candidate) <= 40
            and not any(ch in candidate for ch in "。．.！!？?；;，,")
        ):
            return candidate[:max_len]
    return fallback


def _detect_artifact_type(content: str, expert_type: str) -> str:
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
