"""
Aggregator 节点 - 结果聚合器

整合多个专家的输出结果，生成自然语言的最终回复
v3.2 更新：使用独立数据库会话，避免 MemorySaver 序列化问题
"""
from typing import Dict, Any, List
import uuid
from langchain_core.messages import SystemMessage, HumanMessage
from sqlmodel import Session

from langchain_core.runnables import RunnableConfig

from agents.state import AgentState
from utils.llm_factory import get_aggregator_llm
from utils.event_generator import (
    event_message_delta, event_message_done, sse_event_to_string
)
from agents.services.task_manager import complete_task_session, save_aggregator_message
from database import engine


async def aggregator_node(state: AgentState, config: RunnableConfig = None) -> Dict[str, Any]:
    """
    聚合器节点
    v3.1 更新：调用 LLM 生成自然语言总结，支持流式输出
    v3.2 更新：使用独立数据库会话，避免 MemorySaver 序列化问题
    v3.3 更新：使用事件驱动流式输出，通过 event_queue 实时推送 message.delta 事件
    """
    expert_results = state["expert_results"]
    strategy = state["strategy"]
    task_list = state.get("task_list", [])  # ✅ 获取 task_list 以便返回

    # 获取 task_session_id 和其他状态
    task_session_id = state.get("task_session_id")
    event_queue = state.get("event_queue", [])
    # v3.0: 获取前端传递的 message_id（如果有的话）
    message_id = state.get("message_id", str(uuid.uuid4()))
    thread_id = state.get("thread_id")  # 🔥 用于保存消息到正确线程

    if not expert_results:
        return {
            "task_list": state.get("task_list", []),  # ✅ 添加 task_list
            "final_response": "未生成任何执行结果。",
            "event_queue": event_queue
        }

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
                event_str = sse_event_to_string(delta_event)
                event_queue.append({"type": "sse", "event": event_str})
        
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
            event_str = sse_event_to_string(delta_event)
            event_queue.append({"type": "sse", "event": event_str})
    
    # 发送 message.done 事件
    done_event = event_message_done(
        message_id=message_id,
        full_content=final_response
    )
    event_queue.append({"type": "sse", "event": sse_event_to_string(done_event)})
    
    # v3.2: 更新任务会话状态并持久化聚合消息 (通过 TaskManager)
    # 🔥 使用独立的数据库会话（避免 MemorySaver 序列化问题）
    if task_session_id:
        try:
            with Session(engine) as db_session:
                # 标记任务会话为已完成
                complete_task_session(db_session, task_session_id, final_response)

                # 持久化聚合消息到数据库
                if thread_id:
                    save_aggregator_message(db_session, thread_id, final_response)
        except Exception as e:
            print(f"[AGG] 保存任务会话失败: {e}")
    
    print(f"[AGG] 聚合完成，回复长度: {len(final_response)}")

    # ✅ 返回 task_list 以确保 chat.py 能收集到所有任务状态
    return {
        "task_list": task_list,  # ✅ 添加 task_list
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
    """
    构建 Markdown 格式的简单回复（兜底方案）
    """
    lines = [f"# 执行报告\n**策略**: {strategy}\n---"]
    for i, res in enumerate(expert_results, 1):
        lines.append(f"## {i}. {res['expert_type'].upper()}: {res['description']}")
        lines.append(f"{res['output']}\n")
    return "\n".join(lines)
