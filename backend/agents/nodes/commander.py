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
3. 创建 ExecutionPlan 和 SubTasks（数据库持久化）
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
- 创建 ExecutionPlan（复杂执行计划）
- 批量创建 SubTask（子任务）
- 关联 Thread（对话线程）

[HITL 集成]
- 生成 plan.created 事件后暂停（interrupt）
- 用户可修改/删除/重排任务
- 确认后 Dispatcher 按新计划执行
"""

import asyncio
import logging
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlmodel import Session
from tenacity import (
    before_sleep_log,
    retry,
    retry_if_exception_type,
    stop_after_attempt,
)

from agents.event_stream import emit_event
from agents.plan_tasks import attach_subtask_ids, build_plan_tasks
from agents.state import AgentState
from config import settings
from constants import COMMANDER_SYSTEM_PROMPT
from database import engine
from models.enums import ExecutionMode
from utils.config_cache import ConfigCache
from utils.llm_factory import get_llm_instance
from utils.logger import logger
from utils.message_text import extract_message_text

# P0 优化: 本地内存缓存高频查询 (5分钟TTL)
# commander 配置缓存（单例，很少变化）
_commander_config_cache = ConfigCache(maxsize=10, ttl=300, name="commander_config")
# 专家列表缓存（相对稳定），1分钟TTL，更频繁更新
_all_experts_cache = ConfigCache(maxsize=5, ttl=60, name="all_experts")


# ============================================================================
# Commander 2.0: Pydantic 结构化输出模型
# ============================================================================


class Task(BaseModel):
    """任务定义 - 支持 DAG 依赖关系。

    依赖字段统一叫 `depends_on`（与图状态/数据库/事件 payload/前端一致）。
    历史上 LLM 侧曾叫 `dependencies`（提示词旧教材），2026-09-22 教材已随迁移
    20260922_000200 更新、AliasChoices 容错同步退役——**旧字段名现在显式抛错**
    （静默丢依赖比 loudly 失败危险得多，见 model_validator）。
    """

    id: str = Field(default="", description="任务唯一标识符（短ID，如 task_1, task_2）")
    expert_type: str = Field(description="执行此任务的专家类型")
    description: str = Field(description="任务描述")
    input_data: dict[str, Any] = Field(default={}, description="输入参数")
    depends_on: list[str] = Field(
        default=[],
        description="依赖的任务ID列表（引用其他任务的 id，如 task_1）",
    )

    @model_validator(mode="before")
    @classmethod
    def reject_legacy_dependencies(cls, data: Any) -> Any:
        """旧字段名显式拒绝：`dependencies` 是退役写法（教材已更新），
        静默丢弃会导致依赖凭空消失，必须当场报错。"""
        if isinstance(data, dict) and "dependencies" in data:
            raise ValueError(
                "旧字段名 'dependencies' 已退役，请使用 'depends_on'（提示词教材"
                "如仍教旧名，检查 systemexpert 表是否漏跑迁移 20260922_000200）"
            )
        return data

    execution_mode: ExecutionMode = Field(
        default=ExecutionMode.SEQUENTIAL,
        description=(
            "执行模式。sequential=按依赖顺序逐个执行（默认）；"
            "parallel=与其他无依赖任务同时执行。"
            "注：批次 C 后波次调度按 depends_on 判定并行（wave_scheduler 不读本字段），"
            "当前仅作数据标记保留。"
        ),
    )

    @field_validator("depends_on", mode="before")
    @classmethod
    def parse_dependencies(cls, v):
        """兼容处理：单个 id / 整数依赖统一转成字符串列表"""
        if v is None:
            return []
        if isinstance(v, int | str):
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
        default="", description="规划思考过程：分析需求、拆解步骤、分配专家的推理过程"
    )
    strategy: str = Field(description="执行策略概述：如'并行执行'、'顺序执行'、'分阶段交付'等")
    estimated_steps: int = Field(description="预计步骤数")
    tasks: list[Task] = Field(description="子任务列表，支持依赖关系（DAG）")


def derive_plan_execution_mode(tasks: list[Task]) -> ExecutionMode:
    """由任务的执行模式派生计划级执行模式。

    只要存在任一 `parallel` 任务，计划级即为 `parallel`。该字段目前仅落库、
    无决策消费（执行器在批次 C 才按它分波扇出）；先行派生是为了并行计划
    不会被记成 sequential。
    """
    if any(task.execution_mode == ExecutionMode.PARALLEL for task in tasks):
        return ExecutionMode.PARALLEL
    return ExecutionMode.SEQUENTIAL


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
    from agents.services.task_manager import get_or_create_execution_plan
    from utils.event_generator import (
        event_plan_created,
        event_plan_started,
    )

    # 协议 v2：事件经 emit_event 直推 custom stream，不再经 state/event_queue

    messages = state["messages"]
    last_message = messages[-1]
    user_query = extract_message_text(last_message)

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
            model = settings.model_name
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

                # Stage 3 跨轮产物连续性：构建本会话历史产物清单
                recent_artifacts = state.get("recent_artifacts") or []
                artifacts_section = ""
                if recent_artifacts:
                    lines = []
                    for a in recent_artifacts:
                        title = a.get("title") or "(无标题)"
                        head = (a.get("content_head") or "").replace("\n", " ")[:120]
                        lines.append(
                            f"- 产物ID: {a.get('id')} | 类型: {a.get('type')} | "
                            f"{title} | 产出专家: {a.get('expert_type') or '未知'} | 内容开头: {head}"
                        )
                    artifacts_section = (
                        "\n\n## 本会话已有产物（用户可能要求引用或修改它们）\n"
                        "当用户的请求涉及修改/基于以下既有产物时，请在任务描述中注明产物ID，"
                        "并指示专家使用 get_artifact 工具（参数为产物ID）读取完整内容后再修改：\n"
                        + "\n".join(lines)
                    )
                    logger.info(f"[COMMANDER] 已注入历史产物清单: {len(recent_artifacts)} 个")

                # 构建占位符映射
                placeholder_map = {"user_query": user_query, "dynamic_expert_list": expert_list_str}

                # 替换所有支持的占位符
                for placeholder, value in placeholder_map.items():
                    placeholder_pattern = f"{{{placeholder}}}"
                    if placeholder_pattern in system_prompt:
                        system_prompt = system_prompt.replace(placeholder_pattern, value)
                        logger.info(f"[COMMANDER] 已注入占位符: {{{placeholder}}}")

                # 产物清单：优先走显式占位符；DB 提示词未含占位符时兜底追加
                if "{recent_artifacts}" in system_prompt:
                    system_prompt = system_prompt.replace("{recent_artifacts}", artifacts_section)
                    logger.info("[COMMANDER] 已注入占位符: {recent_artifacts}")
                elif artifacts_section:
                    system_prompt += artifacts_section

                # 检查是否还有未填充的占位符（警告但不中断）
                import re

                remaining_placeholders = re.findall(r"\{([a-zA-Z_][a-zA-Z0-9_]*)\}", system_prompt)
                if remaining_placeholders:
                    logger.warning(f"[COMMANDER] 警告: 以下占位符未填充: {remaining_placeholders}")

            except Exception as e:
                # 注入失败不中断规划，但后果要说清：规划器可能看不到可用专家清单
                # （易编造 expert_type）与用户查询占位符。此前文案是「（已忽略）」
                # 且该 try 把「取专家列表 + 格式化 + 替换 + 校验」全包进来——一旦
                # 失败，连上面那句「未填充占位符」的警告也被一并跳过（二次静默）。
                logger.error(
                    "[COMMANDER] 提示词占位符填充失败，规划质量可能下降"
                    "（专家清单/用户查询可能未注入，模型或编造 expert_type）: %s",
                    e,
                    exc_info=True,
                )

            # 执行 LLM 进行规划
            # 从模型名称推断 provider
            from agents.graph_builder import get_commander_llm_lazy
            from providers_config import get_model_config

            model_config = get_model_config(model)

            if model_config and "provider" in model_config:
                # 使用推断出的 provider 创建 LLM
                provider = model_config["provider"]
                # 优先使用模型配置中的 temperature（如果有）
                final_temperature = model_config.get("temperature", temperature)
                # 获取实际的 API 模型名称（providers.yaml 中定义的 model 字段）
                actual_model = model_config.get("model", model)
                llm = get_llm_instance(
                    provider=provider, streaming=False, temperature=final_temperature
                )
                logger.info(
                    f"[COMMANDER] 模型 '{model}' -> '{actual_model}' 使用 provider: {provider}, temperature: {final_temperature}"
                )
                llm_with_config = llm.bind(model=actual_model, temperature=final_temperature)
            else:
                # 回退到 commander_llm（硬编码的 provider 优先级）
                logger.warning(
                    f"[COMMANDER] 模型 '{model}' 未找到 provider 配置，回退到 commander_llm"
                )
                llm_with_config = get_commander_llm_lazy().bind(
                    model=model, temperature=temperature
                )

            # 🔥🔥🔥 Commander 2.0: JSON Mode + Pydantic 强校验
            # 1️⃣ 获取或生成 execution_plan_id（预览阶段）
            preview_execution_plan_id = state.get("preview_execution_plan_id") or str(uuid.uuid4())

            # 🔥 只有在 chat.py 没有发送 plan.started 的情况下，才在这里发送
            if not state.get("preview_execution_plan_id"):
                await emit_event(
                    event_plan_started(
                        execution_plan_id=preview_execution_plan_id,
                        title="任务规划",
                        content="正在分析需求...",
                        status="running",
                    )
                )
                logger.info(f"[COMMANDER] 发送 plan.started: {preview_execution_plan_id}")
            else:
                logger.info(
                    f"[COMMANDER] 复用 chat.py 发送的 plan.started: {preview_execution_plan_id}"
                )

            # 2️⃣ 用**结构化输出**生成计划（schema 由 function-calling 保证）
            human_prompt = f"用户查询: {user_query}\n\n请分析需求并生成执行计划。"

            logger.info("[COMMANDER] 使用结构化输出生成执行计划...")
            commander_response = await _generate_plan(
                llm_with_config,
                system_prompt,
                human_prompt,
                preview_execution_plan_id,
            )

            # [B4] 计划形状收敛：LLM 输出 → canonical PlanTask（补 id、依赖归一都在这里做）
            plan_tasks = build_plan_tasks(commander_response.tasks)

            # v3.0: 准备子任务数据（支持显式依赖关系 DAG）
            # 转换只有一处（agents/plan_tasks.py），不在这里手写字段映射
            subtasks_data = [plan_task.to_subtask_create() for plan_task in plan_tasks]
            # 计划级执行模式由任务派生（任一任务并行 → 计划级 parallel）。
            # 该字段目前仅落库、无决策消费；派生它可避免并行计划被记成 sequential
            plan_execution_mode = derive_plan_execution_mode(commander_response.tasks)

            # v3.0: 立即持久化到数据库 (通过 TaskManager)
            # 🔥 v3.3: 使用 preview_execution_plan_id 确保事件和数据库记录一致
            # P0 修复: 使用 asyncio.to_thread 避免阻塞事件循环
            execution_plan_id = None
            sub_tasks_list = []
            if thread_id:
                run_id = state.get("run_id")

                def _create_execution_plan():
                    from crud.execution_plan import get_subtasks_by_execution_plan
                    from crud.run_event import emit_plan_created

                    with Session(engine) as db_session:
                        created_plan, is_reused = get_or_create_execution_plan(
                            db=db_session,
                            thread_id=thread_id,
                            run_id=run_id,
                            user_query=user_query,
                            strategy=commander_response.strategy,
                            estimated_steps=commander_response.estimated_steps,
                            subtasks_data=subtasks_data,
                            execution_mode=plan_execution_mode,
                            execution_plan_id=preview_execution_plan_id,
                        )

                        # 在会话关闭前完成子任务数据读取，避免 detached 实例懒加载
                        persisted_subtasks = get_subtasks_by_execution_plan(
                            db_session, created_plan.id
                        )
                        serialized_subtasks = [
                            {
                                "id": subtask.id,
                                "expert_type": subtask.expert_type,
                                "description": subtask.description,
                                "input_data": subtask.input_data,
                                "sort_order": subtask.sort_order,
                                "status": subtask.status,
                            }
                            for subtask in persisted_subtasks
                        ]
                        if not is_reused and run_id:
                            emit_plan_created(
                                db_session,
                                run_id=run_id,
                                thread_id=thread_id,
                                execution_plan_id=created_plan.id,
                                task_count=len(persisted_subtasks),
                                strategy=commander_response.strategy,
                            )
                            db_session.commit()
                        return created_plan.id, is_reused, serialized_subtasks

                execution_plan_id, is_reused, sub_tasks_list = await asyncio.to_thread(
                    _create_execution_plan
                )
                session_source = "复用" if is_reused else "新建"
                logger.info(f"[COMMANDER] ExecutionPlan {session_source}: {execution_plan_id}")

                # 思考载体消息（消息表=执行状态真相源）：content 恒空的助手行，
                # 排在专家消息之前——刷新回放时思考卡（账本重建挂回本条）自然
                # 位于专家卡与聚合正文之前，实时/刷新两态同序。幂等（按 run_id），
                # 驳回修订重跑 commander 不产生第二行。
                thinking_message_id: int | None = None
                try:
                    from services.chat.expert_message import (
                        insert_run_thinking_message_standalone,
                    )

                    thinking_message_id = await asyncio.to_thread(
                        insert_run_thinking_message_standalone,
                        thread_id=thread_id,
                        run_id=state.get("run_id"),
                    )
                except Exception as thinking_row_err:
                    logger.warning(
                        f"[COMMANDER] ⚠️ 思考载体消息插入失败（不影响执行）: {thinking_row_err}"
                    )

                # 🔥🔥🔥 更新 thread.execution_plan_id，确保前端能查询到
                # P0 修复: 使用 asyncio.to_thread 避免阻塞事件循环
                from models import Thread

                def _update_thread():
                    with Session(engine) as db_session:
                        thread = db_session.get(Thread, thread_id)
                        if thread:
                            thread.execution_plan_id = execution_plan_id
                            thread.agent_type = "ai"  # 🔥 同时更新 agent_type
                            db_session.add(thread)
                            db_session.commit()
                            return True
                        return False

                updated = await asyncio.to_thread(_update_thread)
                if updated:
                    logger.info(
                        f"[COMMANDER] ✅ 已更新 thread.execution_plan_id: {execution_plan_id}"
                    )

            # 转换为内部字典格式（用于 LangGraph 状态流转）
            # [B4] 落库结果回填 subtask_id，然后只经 canonical 模型的显式转换产出
            # 图状态 dict 与事件 payload（此前这两处各自手写字段映射，是漂移高发区）
            plan_tasks = attach_subtask_ids(plan_tasks, sub_tasks_list)
            task_list = [plan_task.to_state_dict() for plan_task in plan_tasks]

            logger.info(
                f"[COMMANDER] 生成了 {len(task_list)} 个任务。策略: {commander_response.strategy}"
            )

            # P1 优化: 预加载所有专家配置到缓存
            # P0 修复: 传入 engine 而不是 db_session，让函数内部自己管理会话
            await _preload_expert_configs(task_list)

            # 🔥 v3.3: 使用 preview_execution_plan_id 保持一致性

            # 4️⃣ 发送 plan.created 事件（完成状态）
            if execution_plan_id:
                await emit_event(
                    event_plan_created(
                        execution_plan_id=execution_plan_id,
                        summary=commander_response.strategy,
                        estimated_steps=commander_response.estimated_steps,
                        execution_mode=plan_execution_mode,
                        # 同一份 canonical 计划 → 事件 payload（键集与 TaskInfo 由测试钉住）
                        tasks=[plan_task.to_event_task_dict() for plan_task in plan_tasks],
                        message_id=thinking_message_id,
                    )
                )

            return {
                "task_list": task_list,
                "strategy": commander_response.strategy,
                "expert_results": [],
                "execution_plan_id": execution_plan_id,
                # 回写预览 ID：使同一 run 内节点重执行（重试/并行分支）拿到同一
                # ID，而不是每次新生成 uuid（该键已在 AgentState 声明才会持久化）
                "preview_execution_plan_id": preview_execution_plan_id,
            }

    except Exception:
        # 规划失败必须显式失败（评审 H2）：此前吞成 task_list=[] + strategy="Error: …"，
        # 于是 plan_approval 放行空计划、aggregator 提前回「未生成任何执行结果。」——
        # run 正常完结、无失败标记、无 task.failed 事件，用户只看到一句莫名其妙的话，
        # 排障只能翻服务端日志。上抛后由图执行层统一收口（标 run 失败 + error 事件）。
        logger.exception("[ERROR] Commander 规划失败，向上抛出以失败本 run")
        raise


class PlanGenerationError(RuntimeError):
    """结构化输出未产出合法计划（schema 层面的失败）。

    单独成类，是为了让重试**只针对这一类问题**。此前的写法是
    `retry_if_exception_type((ValidationError, Exception))`——等价于重试一切，
    连网络错误也重试（而网络重试已由 ChatOpenAI 内建 max_retries 承担），
    且 `wait_fixed(0.5)` 对 LLM 的输出波动没有实际帮助。
    """


@retry(
    retry=retry_if_exception_type(PlanGenerationError),
    stop=stop_after_attempt(2),
    before_sleep=before_sleep_log(logger, logging.WARNING),
    reraise=True,
)
async def _generate_plan(
    llm,
    system_prompt: str,
    human_prompt: str,
    preview_execution_plan_id: str,
) -> ExecutionPlan:
    """用**结构化输出**生成执行计划。

    取代此前「JSON Mode + 手抽 JSON + Pydantic 校验」的三段式：输出符合
    `ExecutionPlan` schema 由 provider 的 function-calling 保证，因此不再需要
    剥 markdown 围栏、截取首尾大括号、以及在提示词里追加
    "You MUST output a valid JSON object"——那些都是缺少 schema 约束时的补丁。

    `include_raw=True` 保留原始响应，用于两件不能丢的事：
      1. `plan.thinking` 事件（用户可见的规划思考流）
      2. 失败时排障（拿到模型真正吐了什么）
    """
    from utils.event_generator import event_plan_thinking

    structured = llm.with_structured_output(ExecutionPlan, include_raw=True)
    result = await structured.ainvoke(
        [SystemMessage(content=system_prompt), HumanMessage(content=human_prompt)],
        config=RunnableConfig(
            tags=["commander", "structured_output"],
            metadata={"node_type": "commander"},
        ),
    )

    # include_raw=True 时返回 {"raw": AIMessage, "parsed": ExecutionPlan|None,
    #                          "parsing_error": Exception|None}
    raw_text = ""
    parsed: ExecutionPlan | None = None
    parsing_error: object | None = None
    if isinstance(result, dict):
        parsed = result.get("parsed")
        parsing_error = result.get("parsing_error")
        raw_text = getattr(result.get("raw"), "content", "") or ""
    else:
        parsed = result  # 少数实现直接返回对象

    # 先发 thinking（与改造前一致：即使随后校验失败，思考流也已可见）
    thinking_preview = raw_text[:200] + "..." if len(raw_text) > 200 else raw_text
    await emit_event(
        event_plan_thinking(
            execution_plan_id=preview_execution_plan_id,
            delta=f"[规划分析中...]\n{thinking_preview}",
        )
    )

    if parsed is None:
        raise PlanGenerationError(f"结构化输出未产出合法计划: {parsing_error or '空结果'}")
    return parsed


# 说明：本模块的「JSON Mode + 手抽 JSON + tenacity 重试」三段式已由
# _generate_plan（结构化输出）取代，_extract_json_string / _generate_plan_once /
# _generate_plan_with_json_mode 全部移除。原实现的三处补丁——剥 markdown 围栏、
# 截取首尾大括号、在提示词里追加 "You MUST output a valid JSON object"——
# 都是缺少 schema 约束时的替代品，现由 function-calling 保证。
