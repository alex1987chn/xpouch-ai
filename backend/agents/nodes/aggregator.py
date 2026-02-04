"""
Aggregator 节点 - 结果聚合器

整合多个专家的输出结果，生成自然语言的最终回复
"""
from typing import Dict, Any, List
from uuid import uuid4
from langchain_core.messages import SystemMessage, HumanMessage

from agents.state import AgentState
from utils.llm_factory import get_aggregator_llm
from utils.event_generator import (
    event_message_delta, event_message_done, sse_event_to_string
)
from crud.task_session import update_task_session_status
from models import Message as MessageModel


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
        
        # 关键修复：持久化聚合消息到数据库
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
    """
    构建 Markdown 格式的简单回复（兜底方案）
    """
    lines = [f"# 执行报告\n**策略**: {strategy}\n---"]
    for i, res in enumerate(expert_results, 1):
        lines.append(f"## {i}. {res['expert_type'].upper()}: {res['description']}")
        lines.append(f"{res['output']}\n")
    return "\n".join(lines)
