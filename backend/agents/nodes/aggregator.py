"""
Aggregator 节点 - 结果聚合器

整合多个专家的输出结果，生成自然语言的最终回复
v3.2 更新：使用独立数据库会话，避免 MemorySaver 序列化问题
v3.5 更新：实现三层兜底提示词体系 (DB -> Cache -> Constants)
v3.6 优化: P0 修复 + TTLCache 本地内存缓存高频查询
"""
import asyncio
import uuid
from typing import Any

from cachetools import TTLCache
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig
from sqlmodel import Session

from agents.services.expert_manager import get_expert_config_cached
from agents.services.task_manager import complete_task_session, save_aggregator_message
from agents.state import AgentState
from constants import AGGREGATOR_SYSTEM_PROMPT
from database import engine
from utils.event_generator import event_message_delta, event_message_done, sse_event_to_string
from utils.llm_factory import get_aggregator_llm
from utils.logger import logger

# P0 优化: 本地内存缓存 aggregator 配置 (5分钟TTL)
_aggregator_config_cache: TTLCache = TTLCache(maxsize=10, ttl=300)


async def aggregator_node(state: AgentState, config: RunnableConfig = None) -> dict[str, Any]:
    """
    聚合器节点
    v3.1 更新：调用 LLM 生成自然语言总结，支持流式输出
    v3.2 更新：使用独立数据库会话，避免 MemorySaver 序列化问题
    v3.3 更新：使用事件驱动流式输出，通过 event_queue 实时推送 message.delta 事件
    v3.5 更新：实现三层兜底提示词体系 (DB -> Cache -> Constants)
    """
    expert_results = state["expert_results"]
    strategy = state["strategy"]
    task_list = state.get("task_list", [])  # ✅ 获取 task_list 以便返回

    # 获取 task_session_id 和其他状态
    task_session_id = state.get("task_session_id")
    base_event_queue = state.get("event_queue", [])
    # v3.0: 获取前端传递的 message_id（如果有的话）
    message_id = state.get("message_id", str(uuid.uuid4()))
    thread_id = state.get("thread_id")  # 🔥 用于保存消息到正确线程

    if not expert_results:
        return {
            "task_list": state.get("task_list", []),  # ✅ 添加 task_list
            "final_response": "未生成任何执行结果。",
            "event_queue": [*base_event_queue],
        }

    logger.info(f"[AGG] 正在聚合 {len(expert_results)} 个结果，调用 LLM 生成总结...")

    # v3.5: 构建 Aggregator 的 Prompt（专家成果摘要）
    aggregator_input = _build_aggregator_input(expert_results, strategy)

    # v3.5: 三层兜底加载 System Prompt (L1: DB -> L2: Cache -> L3: Constants)
    system_prompt = _load_aggregator_system_prompt(aggregator_input)
    logger.info(f"[AGG] System Prompt 长度: {len(system_prompt)} 字符")

    # v3.1: 获取 Aggregator LLM（带兜底逻辑）
    aggregator_llm = get_aggregator_llm()

    # v3.1: 流式生成总结
    final_response_chunks = []

    delta_events = []

    try:
        # 🔥 关键修复：添加 metadata 标记为 aggregator 节点
        # transform_langgraph_event 会识别并允许 aggregator 节点的 message.delta
        # 这样通过 LangGraph 的 on_chat_model_stream 事件发送，避免与 event_queue 重复
        aggregator_config = RunnableConfig(
            tags=["aggregator"],
            metadata={"node_type": "aggregator"}
        )

        # 使用流式输出（通过 LangGraph 的 on_chat_model_stream 事件发送 message.delta）
        async for chunk in aggregator_llm.astream(
            [
                SystemMessage(content=system_prompt),
                HumanMessage(content=aggregator_input)
            ],
            config=aggregator_config
        ):
            content = chunk.content if hasattr(chunk, 'content') else str(chunk)
            if content:
                final_response_chunks.append(content)
                # 🔥 移除：不再通过 event_queue 发送 message.delta
                # 让 transform_langgraph_event 统一处理，避免重复

        final_response = "".join(final_response_chunks)

    except Exception as e:
        logger.warning(f"[AGG] LLM 总结失败，回退到简单拼接: {e}")
        # 兜底：使用简单拼接
        final_response = _build_markdown_response(expert_results, strategy)

        # 🔥 兜底情况：通过 event_queue 发送（因为没有 LLM 调用）
        chunk_size = 100
        for i in range(0, len(final_response), chunk_size):
            chunk = final_response[i:i + chunk_size]
            delta_event = event_message_delta(
                message_id=message_id,
                content=chunk,
                is_final=False
            )
            event_str = sse_event_to_string(delta_event)
            delta_events.append({"type": "sse", "event": event_str})

    # 发送 message.done 事件
    done_event = event_message_done(
        message_id=message_id,
        full_content=final_response
    )
    full_event_queue = [
        *base_event_queue,
        *delta_events,
        {"type": "sse", "event": sse_event_to_string(done_event)},
    ]

    # v3.2: 更新任务会话状态并持久化聚合消息 (通过 TaskManager)
    # 🔥 使用独立的数据库会话（避免 MemorySaver 序列化问题）
    # P0 修复: 使用 asyncio.to_thread 避免阻塞事件循环
    if task_session_id:
        try:
            def _save_task_session():
                with Session(engine) as db_session:
                    # 标记任务会话为已完成
                    complete_task_session(db_session, task_session_id, final_response)

                    # 持久化聚合消息到数据库
                    if thread_id:
                        save_aggregator_message(db_session, thread_id, final_response)

            await asyncio.to_thread(_save_task_session)
        except Exception as e:
            logger.warning(f"[AGG] 保存任务会话失败: {e}")

    logger.info(f"[AGG] 聚合完成，回复长度: {len(final_response)}")

    # ✅ 返回 task_list 以确保 chat.py 能收集到所有任务状态
    return {
        "task_list": task_list,  # ✅ 添加 task_list
        "final_response": final_response,
        "event_queue": full_event_queue,
    }


def _load_aggregator_system_prompt(input_data: str) -> str:
    """
    v3.5: 三层兜底加载 Aggregator System Prompt
    v3.6: 添加本地内存缓存层 (L0)

    L0: 本地内存缓存 (最快)
    L1: SystemExpert 数据库表
    L2: 全局内存缓存
    L3: constants.AGGREGATOR_SYSTEM_PROMPT (静态兜底)

    Args:
        input_data: 要注入到 {input} 占位符的数据

    Returns:
        str: 处理后的 System Prompt
    """
    system_prompt = None

    # L0: 优先从本地内存缓存读取
    cached_config = _aggregator_config_cache.get("aggregator")
    if cached_config and cached_config.get("system_prompt"):
        system_prompt = cached_config["system_prompt"]
        logger.info("[AGG] 本地缓存命中: System Prompt")
    else:
        # L1/L2: 尝试从数据库/全局缓存加载
        try:
            config = get_expert_config_cached("aggregator")
            if config and config.get("system_prompt"):
                system_prompt = config["system_prompt"]
                # 同步到本地缓存
                _aggregator_config_cache["aggregator"] = config
                logger.info("[AGG] 全局缓存命中: System Prompt")
        except Exception as e:
            logger.warning(f"[AGG] 从数据库加载失败: {e}")

    # L3: 兜底到静态常量
    if not system_prompt:
        system_prompt = AGGREGATOR_SYSTEM_PROMPT
        logger.info("[AGG] 使用静态常量 System Prompt (L3兜底)")

    # 注入 {input} 占位符
    if "{input}" in system_prompt:
        system_prompt = system_prompt.replace("{input}", input_data)
        logger.info("[AGG] 已注入 {input} 占位符")

    return system_prompt


def _build_aggregator_input(expert_results: list[dict[str, Any]], strategy: str) -> str:
    """
    v3.5: 构建 Aggregator 的输入数据（注入到 System Prompt 的 {input} 占位符）

    将多个专家结果格式化为结构化文本，供 Aggregator 整合。

    Args:
        expert_results: 专家执行结果列表
        strategy: 执行策略概述

    Returns:
        str: 供注入的输入文本
    """
    lines = [
        f"【执行策略】: {strategy}",
        "",
        f"【专家成果汇总】: 共 {len(expert_results)} 位专家参与分析",
        ""
    ]

    for i, res in enumerate(expert_results, 1):
        lines.append(f"--- 专家 {i}: {res['expert_type'].upper()} ---")
        lines.append(f"任务: {res['description']}")
        lines.append(f"成果:\n{res['output']}")
        lines.append("")

    return "\n".join(lines)


def _build_markdown_response(expert_results: list[dict[str, Any]], strategy: str) -> str:
    """
    构建 Markdown 格式的简单回复（兜底方案）
    """
    lines = [f"# 执行报告\n**策略**: {strategy}\n---"]
    for i, res in enumerate(expert_results, 1):
        lines.append(f"## {i}. {res['expert_type'].upper()}: {res['description']}")
        lines.append(f"{res['output']}\n")
    return "\n".join(lines)
