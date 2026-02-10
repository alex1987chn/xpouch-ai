"""
聊天路由模块 - 包含主要聊天端点和线程管理
v3.0: 复杂模式使用新的事件协议（plan.created, task.started, task.completed, artifact.generated, message.delta）
"""
import os
import json
import re
import asyncio  # 新增：用于心跳保活
from datetime import datetime
from typing import List, Optional, AsyncGenerator, Dict, Any
from uuid import uuid4

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlmodel import Session, select
from sqlalchemy.orm import selectinload
from langchain_core.messages import HumanMessage, AIMessage

from database import get_session, engine
from dependencies import get_current_user, get_current_user_with_auth
from utils.thinking_parser import parse_thinking
from models import (
    User, Thread, Message, CustomAgent, TaskSession, SubTask
)
from crud.task_session import (
    create_task_session,
    get_task_session_by_thread,
    update_task_session_status,
    create_subtask,
    get_subtasks_by_session,
    update_subtask_status,
    create_artifacts_batch
)
from constants import (
    normalize_agent_id,
    SYSTEM_AGENT_ORCHESTRATOR,
    SYSTEM_AGENT_DEFAULT_CHAT
)
from utils.llm_factory import get_llm_instance
from agents.graph import commander_graph, create_smart_router_workflow  # 🔥 新增：导入 create_smart_router_workflow
from utils.exceptions import AppError, NotFoundError, AuthorizationError

# 🔥 HITL (Human-in-the-Loop) 支持
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from utils.db import get_db_connection  # 🔥 新增：LangGraph 数据库连接


router = APIRouter(prefix="/api", tags=["chat"])

DEBUG = os.getenv("DEBUG", "false").lower() == "true"


# ============================================================================
# 请求模型
# ============================================================================

class ChatMessageDTO(BaseModel):
    role: str
    content: str
    id: Optional[str] = None
    timestamp: Optional[str] = None


class ChatRequest(BaseModel):
    message: str
    history: List[ChatMessageDTO]
    conversationId: Optional[str] = None
    agentId: Optional[str] = "assistant"
    stream: Optional[bool] = True
    message_id: Optional[str] = None  # v3.0: 前端传递的助手消息 ID


# ============================================================================
# HITL (Human-in-the-Loop) 请求模型
# ============================================================================

class ResumeRequest(BaseModel):
    """恢复被中断的 HITL 流程请求"""
    thread_id: str
    updated_plan: Optional[List[Dict[str, Any]]] = None
    approved: bool = True


# ============================================================================
# 线程管理 API
# ============================================================================

@router.get("/threads", response_model=List[dict])
async def get_threads(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """获取当前用户的所有线程列表"""
    statement = (
        select(Thread)
        .where(Thread.user_id == current_user.id)
        .options(selectinload(Thread.messages))
        .order_by(Thread.updated_at.desc())
    )
    threads = session.exec(statement).all()
    
    result = []
    for thread in threads:
        result.append({
            "id": thread.id,
            "title": thread.title,
            "agent_id": thread.agent_id,
            "agent_type": thread.agent_type,
            "thread_mode": thread.thread_mode,
            "user_id": thread.user_id,
            "task_session_id": thread.task_session_id,
            "created_at": thread.created_at.isoformat() if thread.created_at else None,
            "updated_at": thread.updated_at.isoformat() if thread.updated_at else None,
            "messages": [
                {
                    "id": msg.id,
                    "role": msg.role,
                    "content": msg.content,
                    "timestamp": msg.timestamp.isoformat() if msg.timestamp else None
                }
                for msg in thread.messages
            ]
        })
    return result


@router.get("/threads/{thread_id}")
async def get_thread(
    thread_id: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """获取单个线程详情"""
    statement = (
        select(Thread)
        .where(Thread.id == thread_id)
        .options(selectinload(Thread.messages))
    )
    thread = session.exec(statement).first()

    if not thread or thread.user_id != current_user.id:
        raise NotFoundError(resource="会话")

    # 如果是AI助手线程（复杂模式），加载TaskSession和SubTask
    print(f"[GET_THREAD] thread_id={thread_id}, agent_type={thread.agent_type}, task_session_id={thread.task_session_id}, messages_count={len(thread.messages)}")
    # 打印所有消息的角色，帮助调试
    for msg in thread.messages:
        print(f"[GET_THREAD]   - msg_id={msg.id}, role={msg.role}, content_preview={msg.content[:30] if msg.content else 'N/A'}...")
    if thread.agent_type == "ai" and thread.task_session_id:
        task_session = session.get(TaskSession, thread.task_session_id)
        if task_session:
            # v3.0: 使用 selectinload 预加载 artifacts 关系，避免 N+1 查询
            statement = (
                select(SubTask)
                .where(SubTask.task_session_id == task_session.session_id)
                .options(selectinload(SubTask.artifacts))
                .order_by(SubTask.sort_order)
            )
            sub_tasks = session.exec(statement).all()

            return {
                "id": thread.id,
                "title": thread.title,
                "agent_id": thread.agent_id,
                "agent_type": thread.agent_type,
                "user_id": thread.user_id,
                "task_session_id": thread.task_session_id,
                "created_at": thread.created_at.isoformat() if thread.created_at else None,
                "updated_at": thread.updated_at.isoformat() if thread.updated_at else None,
                "messages": [
                    {
                        "id": msg.id,
                        "role": msg.role,
                        "content": msg.content,
                        "timestamp": msg.timestamp.isoformat() if msg.timestamp else None,
                        "extra_data": msg.extra_data
                    }
                    for msg in thread.messages
                ],
                "task_session": {
                    "id": task_session.session_id,  # ✅ 前端兼容性：同时提供 id 和 session_id
                    "session_id": task_session.session_id,
                    "user_query": task_session.user_query,
                    "final_response": task_session.final_response,
                    "status": task_session.status,
                    "sub_tasks": [
                        {
                            "id": st.id,
                            "task_session_id": st.task_session_id,
                            "expert_type": st.expert_type,
                            "task_description": st.task_description,
                            "status": st.status,
                            "output_result": st.output_result,
                            "error_message": st.error_message,
                            "artifacts": [
                                {
                                    "id": art.id,
                                    "type": art.type,
                                    "title": art.title,
                                    "content": art.content,
                                    "language": art.language,
                                    "sort_order": art.sort_order,
                                    "created_at": art.created_at.isoformat() if art.created_at else None
                                }
                                for art in (st.artifacts or [])
                            ],
                            "duration_ms": st.duration_ms,
                            "created_at": st.created_at.isoformat() if st.created_at else None
                        }
                        for st in sub_tasks
                    ]
                }
            }

    return {
        "id": thread.id,
        "title": thread.title,
        "agent_id": thread.agent_id,
        "agent_type": thread.agent_type,
        "user_id": thread.user_id,
        "task_session_id": thread.task_session_id,
        "created_at": thread.created_at.isoformat() if thread.created_at else None,
        "updated_at": thread.updated_at.isoformat() if thread.updated_at else None,
        "messages": [
            {
                "id": msg.id,
                "role": msg.role,
                "content": msg.content,
                "timestamp": msg.timestamp.isoformat() if msg.timestamp else None,
                "extra_data": msg.extra_data
            }
            for msg in thread.messages
        ]
    }


@router.delete("/threads/{thread_id}")
async def delete_thread(
    thread_id: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """删除线程"""
    thread = session.get(Thread, thread_id)
    if not thread or thread.user_id != current_user.id:
        raise NotFoundError(resource="会话")
    session.delete(thread)
    session.commit()
    return {"ok": True}


# ============================================================================
# 主要聊天端点
# ============================================================================

@router.post("/chat")
async def chat_endpoint(
    request: ChatRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """
    统一聊天端点（简单模式 + 复杂模式）
    v3.0: 复杂模式使用新的事件协议
    """
    # 1. 确定 Thread ID
    thread_id = request.conversationId
    thread = None

    if thread_id:
        thread = session.get(Thread, thread_id)
        if thread and thread.user_id != current_user.id:
            raise AuthorizationError("没有权限访问此会话")

    if not thread:
        if not thread_id:
            thread_id = str(uuid4())

        # 兜底逻辑：如果 agentId 为 None、null 或空字符串，强制赋值为系统默认助手
        if not request.agentId or request.agentId.strip() == "":
            frontend_agent_id = SYSTEM_AGENT_DEFAULT_CHAT
        else:
            frontend_agent_id = normalize_agent_id(request.agentId)

        # sys-task-orchestrator 是内部实现，不应在 URL 中暴露
        if frontend_agent_id == SYSTEM_AGENT_ORCHESTRATOR:
            frontend_agent_id = SYSTEM_AGENT_DEFAULT_CHAT

        # 根据 agentId 确定 agent_type
        custom_agent_check = session.get(CustomAgent, frontend_agent_id)
        if custom_agent_check and custom_agent_check.user_id == current_user.id:
            agent_type = "custom"
            final_agent_id = frontend_agent_id
        else:
            agent_type = "default"
            final_agent_id = SYSTEM_AGENT_DEFAULT_CHAT

        # 初始 thread_mode 为 simple，Router 会在处理时更新它
        thread = Thread(
            id=thread_id,
            title=request.message[:30] + "..." if len(request.message) > 30 else request.message,
            agent_id=final_agent_id,
            agent_type=agent_type,
            thread_mode="simple",
            user_id=current_user.id,
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        session.add(thread)
        session.commit()
        session.refresh(thread)

    # 2. 保存用户消息到数据库
    user_msg_db = Message(
        thread_id=thread_id,
        role="user",
        content=request.message,
        timestamp=datetime.now()
    )
    session.add(user_msg_db)
    session.commit()
    print(f"[CHAT] ✅ 用户消息已保存到数据库: thread_id={thread_id}, msg_id={user_msg_db.id}")

    # 3. 准备 LangGraph 上下文
    statement = select(Message).where(Message.thread_id == thread_id).order_by(Message.timestamp)
    db_messages = session.exec(statement).all()

    langchain_messages = []
    for msg in db_messages:
        if msg.role == "user":
            langchain_messages.append(HumanMessage(content=msg.content))
        elif msg.role == "assistant":
            langchain_messages.append(AIMessage(content=msg.content))

    # 检查是否是自定义智能体
    custom_agent = None
    normalized_agent_id = normalize_agent_id(request.agentId)

    if normalized_agent_id == SYSTEM_AGENT_ORCHESTRATOR:
        normalized_agent_id = SYSTEM_AGENT_DEFAULT_CHAT

    is_system_default = False

    if normalized_agent_id == SYSTEM_AGENT_DEFAULT_CHAT:
        is_system_default = True
        custom_agent = None
        print(f"[CHAT] 系统默认助手模式 - 将使用 LangGraph Router 决定执行路径")
    else:
        custom_agent = session.get(CustomAgent, normalized_agent_id)

        if custom_agent and custom_agent.user_id == current_user.id:
            custom_agent.conversation_count += 1
            session.add(custom_agent)
            session.commit()
            print(f"[CHAT] 自定义智能体模式 - 直接调用 LLM: {custom_agent.name}")
        else:
            is_system_default = True
            custom_agent = None
            print(f"[CHAT] 未找到自定义智能体，回退到系统默认助手模式")

    # 如果是自定义智能体，使用直接 LLM 调用模式
    if custom_agent:
        if request.stream:
            print(f"[CHAT] {datetime.now().isoformat()} - ✅ 使用自定义智能体流式模式")
            return await _handle_custom_agent_stream(
                custom_agent, langchain_messages, thread_id, thread, request.message_id
            )
        else:
            print(f"[CHAT] {datetime.now().isoformat()} - ❌ 使用自定义智能体非流式模式（假流式！）")
            return await _handle_custom_agent_sync(
                custom_agent, langchain_messages, thread_id, thread, session
            )

    # 系统默认助手模式：通过 LangGraph 处理
    print(f"[CHAT] {datetime.now().isoformat()} - 进入系统默认助手模式，使用 LangGraph 处理")

    initial_state = {
        "messages": langchain_messages,
        "current_agent": "router",
        "task_list": [],
        "current_task_index": 0,
        "strategy": "",
        "expert_results": [],
        "final_response": "",
        "context": {},
        "router_decision": "",
        "thread_id": thread_id,
        "user_id": thread.user_id  # 🔥 传入 user_id 用于记忆功能
    }

    if request.stream:
        print(f"[CHAT] {datetime.now().isoformat()} - ✅ 使用 LangGraph 流式模式（复杂模式）")
        return await _handle_langgraph_stream(
            initial_state, thread_id, thread, request.message, session, request.message_id
        )
    else:
        print(f"[CHAT] {datetime.now().isoformat()} - ❌ 使用 LangGraph 非流式模式（假流式！）")
        return await _handle_langgraph_sync(
            initial_state, thread_id, thread, request.message, session
        )


# ============================================================================
# 自定义智能体处理函数
# ============================================================================

async def _handle_custom_agent_stream(
    custom_agent: CustomAgent,
    langchain_messages: list,
    thread_id: str,
    thread: Thread,
    message_id: Optional[str] = None  # v3.0: 前端传递的助手消息 ID
) -> StreamingResponse:
    """处理自定义智能体流式响应 (v3.0 新协议)
    
    新增：添加心跳保活机制防止 Cloudflare/CDN 超时断开连接
    """
    async def event_generator():
        full_response = ""
        # v3.0: 确保使用一致的 message_id
        actual_message_id = message_id or str(uuid4())

        # 🔥🔥🔥 新增：心跳间隔（15秒）远小于 Cloudflare 的 100秒超时 🔥🔥🔥
        HEARTBEAT_INTERVAL = 15.0

        print(f"[CUSTOM AGENT STREAM] {datetime.now().isoformat()} - 开始流式处理，心跳间隔={HEARTBEAT_INTERVAL}秒，强制心跳间隔=30.0秒")

        # 🔥 强制心跳计时器（每 30 秒强制发送一次心跳，不管有没有事件）
        FORCE_HEARTBEAT_INTERVAL = 30.0
        last_heartbeat_time = datetime.now()

        try:
            # 使用新的配置系统获取模型
            from providers_config import get_model_config, get_provider_config, get_provider_api_key
            
            model_id = custom_agent.model_id or "deepseek-chat"
            model_config = get_model_config(model_id)
            
            if model_config:
                # 从配置文件获取提供商和实际模型名
                provider = model_config.get('provider')
                actual_model = model_config.get('model', model_id)
                provider_config = get_provider_config(provider)
                
                if not provider_config:
                    raise ValueError(f"提供商 {provider} 未配置")
                
                if not get_provider_api_key(provider):
                    raise ValueError(f"提供商 {provider} 的 API Key 未设置，请在 .env 中配置 {provider_config.get('env_key')}")

                # 从模型配置读取 temperature（允许模型级别覆盖）
                model_config = get_model_config(model_id)
                temperature = model_config.get('temperature', 0.7) if model_config else 0.7

                print(f"[CUSTOM AGENT] 使用模型: {model_id} ({actual_model} via {provider}), temperature={temperature}，消息ID: {actual_message_id}")

                # 使用新的 llm_factory（会自动从配置文件读取 base_url）
                llm = get_llm_instance(
                    provider=provider,
                    model=actual_model,
                    streaming=True,
                    temperature=temperature
                )
            else:
                # Fallback: 旧版兼容（直接传递模型名）
                # 尝试从模型配置读取 temperature
                model_config = get_model_config(model_id)
                temperature = model_config.get('temperature', 0.7) if model_config else 0.7

                print(f"[CUSTOM AGENT] 未找到模型配置，使用 fallback: {model_id}, temperature={temperature}")
                llm = get_llm_instance(streaming=True, model=model_id, temperature=temperature)

            # 🔥 检索长期记忆
            from services.memory_manager import memory_manager
            user_query = langchain_messages[-1].content if langchain_messages else ""
            relevant_memories = await memory_manager.search_relevant_memories(thread.user_id, user_query, limit=5)
            
            # 构建 System Prompt（注入记忆）
            system_prompt = custom_agent.system_prompt
            if relevant_memories:
                print(f"[CUSTOM AGENT] 激活记忆: {relevant_memories[:100]}...")
                system_prompt += f"\n\n【关于用户的已知信息】:\n{relevant_memories}\n(请在回答时自然地利用这些信息)"
            
            messages_with_system = [("system", system_prompt)]
            messages_with_system.extend(langchain_messages)

            # 获取流迭代器
            iterator = llm.astream(messages_with_system)

            # 辅助函数：安全地获取下一个 chunk
            async def get_next_chunk():
                try:
                    return await asyncio.wait_for(
                        iterator.__anext__(),
                        timeout=HEARTBEAT_INTERVAL
                    )
                except StopAsyncIteration:
                    return None

            while True:
                try:
                    # 等待下一个 chunk，超过 15 秒则发送心跳
                    chunk = await get_next_chunk()

                    if chunk is None:  # 流结束
                        break

                    content = chunk.content
                    if content:
                        full_response += content
                        # v3.0: 使用 message.delta 事件（新协议）
                        from event_types.events import EventType, MessageDeltaData, build_sse_event
                        delta_event = build_sse_event(
                            EventType.MESSAGE_DELTA,
                            MessageDeltaData(
                                message_id=actual_message_id,
                                content=content
                            ),
                            str(uuid4())
                        )
                        from utils.event_generator import sse_event_to_string
                        yield sse_event_to_string(delta_event)

                except asyncio.TimeoutError:
                    # 🔥🔥🔥 心跳保活：LLM 正在思考，但超过 15 秒未产生数据 🔥🔥🔥
                    # 发送 SSE 注释（冒号开头），浏览器会忽略，但 Cloudflare 认为有数据传输
                    print(f"[HEARTBEAT-CUSTOM-TIMEOUT] {datetime.now().isoformat()} - 发送心跳保活（已等待 {HEARTBEAT_INTERVAL} 秒无数据）")
                    yield ": keep-alive\n\n"
                    last_heartbeat_time = datetime.now()
                    continue

                # 🔥 强制心跳：即使有事件，每 30 秒也强制发送一次心跳
                current_time = datetime.now()
                time_since_last_heartbeat = (current_time - last_heartbeat_time).total_seconds()
                if time_since_last_heartbeat >= FORCE_HEARTBEAT_INTERVAL:
                    print(f"[HEARTBEAT-CUSTOM-FORCE] {datetime.now().isoformat()} - 强制发送心跳保活（距离上次心跳 {time_since_last_heartbeat:.1f} 秒）")
                    yield ": keep-alive\n\n"
                    last_heartbeat_time = current_time

        except Exception as e:
            import traceback
            traceback.print_exc()
            # v3.0: 发送 error 事件
            from event_types.events import EventType, ErrorData, build_sse_event
            from utils.event_generator import sse_event_to_string
            error_event = build_sse_event(
                EventType.ERROR,
                ErrorData(code="STREAM_ERROR", message=str(e)),
                str(uuid4())
            )
            yield sse_event_to_string(error_event)

        # 解析 thinking 标签（类似 DeepSeek Chat 的思考过程）
        clean_content, thinking_data = parse_thinking(full_response)

        # v3.0: 发送 message.done 事件（新协议）
        # 使用与 delta 事件相同的 actual_message_id
        from event_types.events import EventType, MessageDoneData, build_sse_event
        done_event = build_sse_event(
            EventType.MESSAGE_DONE,
            MessageDoneData(
                message_id=actual_message_id,
                full_content=clean_content,  # 使用清理后的内容
                thinking=thinking_data  # 包含 thinking 数据
            ),
            str(uuid4())
        )
        from utils.event_generator import sse_event_to_string
        yield sse_event_to_string(done_event)

        yield "data: [DONE]\n\n"
        print(f"[CUSTOM AGENT] 流式响应完成，消息ID: {actual_message_id}")

        # 保存 AI 回复到数据库
        if full_response:
            ai_msg_db = Message(
                thread_id=thread_id,
                role="assistant",
                content=clean_content,  # 保存清理后的内容（移除 thought 标签）
                extra_data={'thinking': thinking_data} if thinking_data else None,
                timestamp=datetime.now()
            )
            with Session(engine) as inner_session:
                inner_session.add(ai_msg_db)
                thread_obj = inner_session.get(Thread, thread_id)
                if thread_obj:
                    thread_obj.updated_at = datetime.now()
                    inner_session.add(thread_obj)
                inner_session.commit()
        
        yield "data: [DONE]\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


async def _handle_custom_agent_sync(
    custom_agent: CustomAgent,
    langchain_messages: list,
    thread_id: str,
    thread: Thread,
    session: Session
) -> dict:
    """处理自定义智能体非流式响应"""
    # 使用新的配置系统获取模型
    from providers_config import get_model_config, get_provider_config, get_provider_api_key
    
    model_id = custom_agent.model_id or "deepseek-chat"
    model_config = get_model_config(model_id)
    
    if model_config:
        provider = model_config.get('provider')
        actual_model = model_config.get('model', model_id)
        provider_config = get_provider_config(provider)
        
        if not provider_config:
            raise ValueError(f"提供商 {provider} 未配置")
        
        if not get_provider_api_key(provider):
            raise ValueError(f"提供商 {provider} 的 API Key 未设置")
        
        print(f"[CUSTOM AGENT] 使用模型: {model_id} ({actual_model} via {provider})")
        
        llm = get_llm_instance(
            provider=provider,
            model=actual_model,
            streaming=False,
            temperature=0.7
        )
    else:
        print(f"[CUSTOM AGENT] 未找到模型配置，使用 fallback: {model_id}")
        llm = get_llm_instance(streaming=False, model=model_id, temperature=0.7)
    
    # 🔥 检索长期记忆
    from services.memory_manager import memory_manager
    user_query = langchain_messages[-1].content if langchain_messages else ""
    relevant_memories = await memory_manager.search_relevant_memories(thread.user_id, user_query, limit=5)
    
    # 构建 System Prompt（注入记忆）
    system_prompt = custom_agent.system_prompt
    if relevant_memories:
        print(f"[CUSTOM AGENT] 激活记忆: {relevant_memories[:100]}...")
        system_prompt += f"\n\n【关于用户的已知信息】:\n{relevant_memories}\n(请在回答时自然地利用这些信息)"
    
    messages_with_system = [("system", system_prompt)]
    messages_with_system.extend(langchain_messages)
    
    result = await llm.ainvoke(messages_with_system)
    full_response = result.content

    # 保存 AI 回复
    # 解析 thinking 标签
    clean_content, thinking_data = parse_thinking(full_response)
    ai_msg_db = Message(
        thread_id=thread_id,
        role="assistant",
        content=clean_content,  # 保存清理后的内容
        extra_data={'thinking': thinking_data} if thinking_data else None,
        timestamp=datetime.now()
    )
    session.add(ai_msg_db)
    thread.updated_at = datetime.now()
    session.add(thread)
    session.commit()

    return {
        "role": "assistant",
        "content": full_response,
        "conversationId": thread_id
    }


# ============================================================================
# LangGraph 处理函数 - v3.0 新协议
# ============================================================================

async def _handle_langgraph_stream(
    initial_state: dict,
    thread_id: str,
    thread: Thread,
    user_message: str,
    session: Session,
    message_id: Optional[str] = None  # v3.0: 前端传递的助手消息 ID
) -> StreamingResponse:
    """
    处理 LangGraph 流式响应 (v3.0)
    只发送新协议事件：plan.created, task.started, task.completed, artifact.generated, message.delta, message.done
    
    新增：添加心跳保活机制防止 Cloudflare/CDN 超时断开连接
    v3.5 更新：使用 AsyncPostgresSaver 实现 HITL (Human-in-the-Loop) 持久化
    """
    async def event_generator():
        full_response = ""
        event_count = 0
        router_mode = ""
        task_session_id = None  # v3.0: 跟踪 TaskSession ID

        # v3.0: 收集任务列表和产物（用于最终保存）
        collected_task_list = []
        expert_artifacts = {}

        # v3.0: 在 initial_state 中注入 event_queue 和 message_id
        # 🔥 注意：不要放入 db_session，因为 MemorySaver 无法序列化 SQLAlchemy Session
        # thread_id 和 user_id 已在创建 initial_state 时注入
        initial_state["event_queue"] = []
        initial_state["message_id"] = message_id  # v3.0: 注入前端传递的助手消息 ID

        # 🔥🔥🔥 v3.4: Shared Queue 模式 - 创建共享队列用于 Commander 实时流式输出
        stream_queue = asyncio.Queue()
        
        # 🔥🔥🔥 新增：心跳间隔（15秒）远小于 Cloudflare 的 100秒超时 🔥🔥🔥
        HEARTBEAT_INTERVAL = 15.0

        print(f"[LANGGRAPH STREAM] {datetime.now().isoformat()} - 开始流式处理，心跳间隔={HEARTBEAT_INTERVAL}秒，强制心跳间隔=30.0秒")
        print(f"[LANGGRAPH STREAM] v3.5 HITL 模式已启用 (AsyncPostgresSaver)")

        # 🔥 强制心跳计时器（每 30 秒强制发送一次心跳，不管有没有事件）
        FORCE_HEARTBEAT_INTERVAL = 30.0
        last_heartbeat_time = datetime.now()

        # 🔥🔥🔥 v3.5: HITL (Human-in-the-Loop) 支持
        # 使用 AsyncPostgresSaver 实现状态持久化
        
        # 1. 定义生产者任务 (Producer) - 在后台运行 Graph
        async def producer():
            """生产者：运行 LangGraph，将事件放入队列"""
            graph = None
            config = None
            try:
                # 🔥🔥🔥 v3.5: 创建 AsyncPostgresSaver 实现持久化
                async with get_db_connection() as conn:
                    checkpointer = AsyncPostgresSaver(conn)
                    
                    # 🔥 使用持久化的 checkpointer 创建 graph
                    graph = create_smart_router_workflow(checkpointer=checkpointer)
                    print(f"[PRODUCER] Graph compiled with AsyncPostgresSaver for HITL")
                    
                    config = {
                        "recursion_limit": 100,
                        "configurable": {
                            "thread_id": thread_id,
                            "stream_queue": stream_queue  # 🔥 注入共享队列
                        }
                    }
                    
                    # 获取图的流迭代器，注入 stream_queue
                    iterator = graph.astream_events(
                        initial_state,
                        config=config,
                        version="v2"
                    )
                    
                    # 消费 Graph 事件
                    async for event in iterator:
                        # 将事件放入队列，让主循环处理
                        await stream_queue.put({"type": "graph_event", "event": event})
                    
                    # 🔥🔥🔥 v3.5 HITL: 检查是否因中断而停止
                    # 使用相同的 config 获取 state snapshot
                    snapshot = await graph.aget_state(config)
                    if snapshot.next:  # 如果 next 不为空，说明任务未完成但停止了 -> 处于 Pause 状态
                        current_plan = snapshot.values.get("task_list", [])
                        print(f"[PRODUCER] 🔴 HITL 中断触发！计划任务数: {len(current_plan)}")
                        await stream_queue.put({
                            "type": "hitl_interrupt",
                            "data": {
                                "type": "plan_review",
                                "current_plan": current_plan
                            }
                        })
                    else:
                        print(f"[PRODUCER] ✅ Graph 正常完成，无中断")
                    
            except Exception as e:
                print(f"[PRODUCER] 错误: {e}")
                import traceback
                traceback.print_exc()
                await stream_queue.put({"type": "graph_error", "error": str(e)})
            finally:
                # 🔥 哨兵信号：通知消费者结束
                await stream_queue.put(None)
        
        # 2. 启动后台生产者任务
        producer_task = asyncio.create_task(producer())
        
        # 3. 消费者循环 (Consumer) - 主线程消费队列并 yield SSE
        try:
            while True:
                # 等待队列消息（带超时防止死锁）
                try:
                    token = await asyncio.wait_for(stream_queue.get(), timeout=1.0)
                except asyncio.TimeoutError:
                    # 超时检查生产者是否已结束
                    if producer_task.done():
                        # 再次尝试读空队列，防止丢失最后的消息
                        while not stream_queue.empty():
                            item = stream_queue.get_nowait()
                            if item is None:
                                break
                            yield item
                        break
                    # 生产者还在运行，发送心跳保活
                    current_time = datetime.now()
                    time_since_last_heartbeat = (current_time - last_heartbeat_time).total_seconds()
                    if time_since_last_heartbeat >= FORCE_HEARTBEAT_INTERVAL:
                        yield ": keep-alive\n\n"
                        last_heartbeat_time = current_time
                    continue
                
                # 🔥 收到哨兵信号，结束消费
                if token is None:
                    print(f"[CONSUMER] 收到哨兵信号，结束消费")
                    break
                
                # 🔥 强制心跳检查（每 30 秒）
                current_time = datetime.now()
                time_since_last_heartbeat = (current_time - last_heartbeat_time).total_seconds()
                if time_since_last_heartbeat >= FORCE_HEARTBEAT_INTERVAL:
                    yield ": keep-alive\n\n"
                    last_heartbeat_time = current_time
                
                # 处理队列中的事件
                if token.get("type") == "graph_error":
                    # Graph 执行出错
                    error_msg = token.get("error", "未知错误")
                    print(f"[CONSUMER] Graph 执行错误: {error_msg}")
                    break
                
                elif token.get("type") == "graph_event":
                    # 处理 Graph 标准事件（plan.created, task.started 等）
                    event = token["event"]
                    event_count += 1
                    kind = event["event"]
                    name = event.get("name", "")
                    
                    if event_count % 100 == 0:
                        print(f"[CONSUMER] 已处理 {event_count} 个事件")
                
                elif token.get("type") == "sse":
                    # 🔥🔥🔥 v3.4: Commander 直接通过 queue 发送的 SSE 事件
                    # 这是实时流式思考内容 (plan.thinking)
                    print(f"[CONSUMER] 📤 yield SSE 事件: {token['event'][:100]}...")
                    yield token["event"]
                    continue
                
                elif token.get("type") == "hitl_interrupt":
                    # 🔥🔥🔥 v3.5 HITL: 人类审核中断事件
                    interrupt_data = token.get("data", {})
                    print(f"[CONSUMER] 🔴 HITL 中断事件: {interrupt_data.get('type')}")
                    
                    # 构造 human.interrupt SSE 事件（直接发送数据，不嵌套）
                    event_str = f"event: human.interrupt\ndata: {json.dumps(interrupt_data)}\n\n"
                    yield event_str
                    continue
                
                # 处理 Graph 标准事件（从 graph_event 类型中提取）
                if token.get("type") == "graph_event":
                    event = token["event"]
                    kind = event["event"]
                    name = event.get("name", "")
                    
                    if event_count % 100 == 0:
                        print(f"[CONSUMER] 已处理 {event_count} 个事件")

                    # v3.0: 处理节点返回的 event_queue（新协议事件）
                    if kind == "on_chain_end":
                        raw_output = event["data"].get("output", {})
                        # 确保 output_data 是字典类型（LangGraph 有时会返回字符串）
                        output_data = raw_output if isinstance(raw_output, dict) else {}
                        
                        if isinstance(output_data, dict):
                            event_queue = output_data.get("event_queue", [])

                            # 捕获 commander 节点返回的 task_session_id
                            if name == "commander":
                                session_id = output_data.get("task_session_id")
                                if session_id:
                                    task_session_id = session_id
                                    print(f"[CONSUMER] 捕获到 TaskSession ID: {task_session_id}")
                                    # 立即更新 thread 的 task_session_id
                                    thread_obj = session.get(Thread, thread_id)
                                    if thread_obj and thread_obj.task_session_id != task_session_id:
                                        thread_obj.task_session_id = task_session_id
                                        session.add(thread_obj)
                                        session.commit()
                                        print(f"[CONSUMER] ✅ 已设置 thread.task_session_id = {task_session_id}")

                            # 收集任务列表
                            if output_data.get("task_list"):
                                collected_task_list = output_data["task_list"]
                                
                            # 收集产物
                            if output_data.get("__expert_info"):
                                expert_info = output_data["__expert_info"]
                                task_id = expert_info.get("task_id")
                                artifact_data = output_data.get("artifact")
                                if task_id and artifact_data:
                                    if task_id not in expert_artifacts:
                                        expert_artifacts[task_id] = []
                                    expert_artifacts[task_id].append(artifact_data)
                        else:
                            event_queue = []
                        
                        # 发送 event_queue 中的所有事件
                        for queued_event in event_queue:
                            if queued_event.get("type") == "sse":
                                yield queued_event["event"]

                    # v3.0: 捕获 Router 节点执行结束
                    if kind == "on_chain_end" and name == "router":
                        output_data = event["data"]["output"]
                        router_decision = output_data.get("router_decision", "")

                        if router_decision:
                            print(f"[CONSUMER] Router 决策: {router_decision}")
                            router_mode = router_decision
                            
                            if router_decision == "complex":
                                thread_obj = session.get(Thread, thread_id)
                                if thread_obj:
                                    if thread_obj.agent_type != "ai":
                                        thread_obj.agent_type = "ai"
                                    thread_obj.thread_mode = "complex"
                                    session.add(thread_obj)
                                    session.commit()
                                    print(f"[CONSUMER] 已更新 thread 为 complex 模式")
                                
                                # 🔥🔥🔥 关键：预生成 session_id 并立即发送 plan.started
                                preview_session_id = str(uuid4())
                                from utils.event_generator import event_plan_started, sse_event_to_string
                                plan_started_event = event_plan_started(
                                    session_id=preview_session_id,
                                    title="任务规划",
                                    content="正在分析需求...",
                                    status="running"
                                )
                                yield sse_event_to_string(plan_started_event)
                                print(f"[CONSUMER] 🚀 立即发送 plan.started: {preview_session_id}")
                                
                                # 将 preview_session_id 存入 initial_state
                                initial_state["preview_session_id"] = preview_session_id
                            
                            # 发送 router.decision 事件
                            from event_types.events import EventType, RouterDecisionData, build_sse_event
                            router_event = build_sse_event(
                                EventType.ROUTER_DECISION,
                                RouterDecisionData(decision=router_decision),
                                str(uuid4())
                            )
                            from utils.event_generator import sse_event_to_string
                            yield sse_event_to_string(router_event)

                    # 捕获 direct_reply 节点执行结束（Simple 模式）
                    if kind == "on_chain_end" and name == "direct_reply":
                        from event_types.events import EventType, MessageDoneData, build_sse_event
                        done_event = build_sse_event(
                            EventType.MESSAGE_DONE,
                            MessageDoneData(message_id=message_id or str(uuid4()), full_content=full_response),
                            str(uuid4())
                        )
                        from utils.event_generator import sse_event_to_string
                        yield sse_event_to_string(done_event)
                        print(f"[CONSUMER] Direct Reply 节点完成")

                    # 捕获 LLM 流式输出（Simple 模式）
                    if kind == "on_chat_model_stream" and router_mode == "simple":
                        content = event["data"]["chunk"].content
                        if content:
                            full_response += content
                            from event_types.events import EventType, MessageDeltaData, build_sse_event
                            delta_event = build_sse_event(
                                EventType.MESSAGE_DELTA,
                                MessageDeltaData(message_id=message_id or str(uuid4()), content=content),
                                str(uuid4())
                            )
                            from utils.event_generator import sse_event_to_string
                            yield sse_event_to_string(delta_event)

            print(f"[CONSUMER] 流式处理完成，共处理 {event_count} 个事件")
            
            # 🔥🔥🔥 v3.4: 确保生产者任务完成
            if producer_task and not producer_task.done():
                try:
                    await asyncio.wait_for(producer_task, timeout=5.0)
                except asyncio.TimeoutError:
                    print(f"[CONSUMER] 生产者任务等待超时，强制取消")
                    producer_task.cancel()

        except Exception as e:
            print(f"[STREAM] 错误: {e}")
            import traceback
            traceback.print_exc()
            # v3.0: 发送 error 事件
            from event_types.events import EventType, ErrorData, build_sse_event
            from utils.event_generator import sse_event_to_string
            error_event = build_sse_event(
                EventType.ERROR,
                ErrorData(code="STREAM_ERROR", message=str(e)),
                str(uuid4())
            )
            yield sse_event_to_string(error_event)

        # 保存 AI 回复和 Artifacts 到数据库
        if full_response:
            # ✅ 关键修复：使用 Router 传入的 session（即 db_session），而不是创建新的 session
            # 这样才能看到 Commander 在 db_session 中 commit 的 SubTasks
            save_session = session

            # 解析 thinking 标签
            clean_content, thinking_data = parse_thinking(full_response)
            ai_msg_db = Message(
                thread_id=thread_id,
                role="assistant",
                content=clean_content,  # 保存清理后的内容
                extra_data={'thinking': thinking_data} if thinking_data else None,
                timestamp=datetime.now()
            )
            save_session.add(ai_msg_db)

            thread_obj = save_session.get(Thread, thread_id)
            if thread_obj:
                thread_obj.updated_at = datetime.now()

                if router_mode:
                    thread_obj.thread_mode = router_mode

                # 复杂模式：更新 TaskSession 和保存 SubTask
                if router_mode == "complex" and task_session_id:
                    print(f"[STREAM] 更新复杂模式数据: {len(collected_task_list)} 个任务, session={task_session_id}")
                    # 更新 thread 的 task_session_id
                    thread_obj.task_session_id = task_session_id
                    print(f"[STREAM] ✅ 已设置 thread.task_session_id = {task_session_id}")

                    # 更新 TaskSession 状态为完成
                    update_task_session_status(
                        save_session,
                        task_session_id,
                        "completed",
                        final_response=full_response
                    )

                    # 获取已存在的 SubTasks（避免重复创建）
                    existing_subtasks = get_subtasks_by_session(save_session, task_session_id)
                    existing_subtask_ids = {st.id for st in existing_subtasks}

                    # 保存/更新 SubTasks
                    for idx, task in enumerate(collected_task_list):
                        task_id = task.get("id")
                        expert_type = task.get("expert_type", "")
                        # 使用 task_id 获取 artifacts（与收集时一致）
                        artifacts_for_task = expert_artifacts.get(task_id, [])

                        if task_id and task_id in existing_subtask_ids:
                            # 更新现有 SubTask
                            # output_result 已经是 {"content": "..."} 格式，直接使用
                            output_value = task.get("output_result", {"content": ""})
                            # 兼容处理：如果已经是字典格式，直接使用；否则包装
                            if isinstance(output_value, dict):
                                output_result = output_value
                            else:
                                output_result = {"content": str(output_value)}

                            update_subtask_status(
                                save_session,
                                task_id,
                                status=task.get("status", "completed"),
                                output_result=output_result,
                                duration_ms=task.get("duration_ms")
                            )
                            print(f"[STREAM] ✅ SubTask 状态已更新: {expert_type}")

                            # 保存 artifacts
                            if artifacts_for_task:
                                try:
                                    created = create_artifacts_batch(save_session, task_id, artifacts_for_task)
                                    print(f"[STREAM] ✅ 成功保存 {len(created)} 个 artifacts 到 SubTask: {task_id}")
                                except Exception as art_err:
                                    print(f"[STREAM] ❌ 保存 artifacts 失败: {art_err}")
                                    import traceback
                                    traceback.print_exc()
                        else:
                            # 创建新 SubTask
                            create_subtask(
                                save_session,
                                task_session_id=task_session_id,
                                expert_type=expert_type,
                                task_description=task.get("description", ""),
                                sort_order=task.get("sort_order", 0),
                                input_data=task.get("input_data", {})
                            )

                save_session.add(thread_obj)
                save_session.commit()

        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


async def _handle_langgraph_sync(
    initial_state: dict,
    thread_id: str,
    thread: Thread,
    user_message: str,
    session: Session
) -> dict:
    """处理 LangGraph 非流式响应 (v3.5 HITL 支持)"""
    # 🔥🔥🔥 v3.5: 使用 AsyncPostgresSaver 实现持久化
    async with get_db_connection() as conn:
        checkpointer = AsyncPostgresSaver(conn)
        graph = create_smart_router_workflow(checkpointer=checkpointer)
        print(f"[SYNC MODE] Graph compiled with AsyncPostgresSaver for HITL")
        
        # 🔥 添加 config 传递 thread_id 给 checkpointer，并设置递归限制
        # 注意：recursion_limit 必须在 config 顶层，不能在 configurable 中
        result = await graph.ainvoke(
            initial_state,
            config={
                "recursion_limit": 100,  # 🔥 设置递归限制（放在顶层！）
                "configurable": {
                    "thread_id": thread_id
                }
            }
        )
    last_message = result["messages"][-1]

    # 获取 Router 决策并更新 thread_mode
    router_decision = result.get("router_decision", "simple")
    thread.thread_mode = router_decision
    
    # v3.0: 尽早设置 agent_type，这样即使任务进行中刷新也能正确恢复状态
    if router_decision == "complex":
        thread.agent_type = "ai"
        session.add(thread)
        session.flush()

        # 创建 TaskSession
        task_session = TaskSession(
            session_id=str(uuid4()),
            thread_id=thread_id,
            user_query=user_message,
            status="completed",
            final_response=last_message.content,
            created_at=datetime.now(),
            updated_at=datetime.now(),
            completed_at=datetime.now()
        )
        session.add(task_session)
        session.flush()

        # 更新 thread 的 task_session_id
        thread.task_session_id = task_session.session_id

        # 保存 SubTask（包括 artifacts）
        for subtask in result["task_list"]:
            artifacts = subtask.get("artifact")
            if artifacts:
                artifacts = [artifacts] if isinstance(artifacts, dict) else artifacts

            db_subtask = SubTask(
                id=subtask["id"],
                expert_type=subtask["expert_type"],
                task_description=subtask["description"],
                input_data=subtask["input_data"],
                status=subtask["status"],
                output_result=subtask["output_result"],
                artifacts=artifacts,
                started_at=subtask.get("started_at"),
                completed_at=subtask.get("completed_at"),
                created_at=subtask.get("created_at"),
                updated_at=subtask.get("updated_at"),
                task_session_id=task_session.session_id
            )
            session.add(db_subtask)

    # 保存 AI 回复
    # 解析 thinking 标签
    clean_content, thinking_data = parse_thinking(last_message.content)
    ai_msg_db = Message(
        thread_id=thread_id,
        role="assistant",
        content=clean_content,  # 保存清理后的内容
        extra_data={'thinking': thinking_data} if thinking_data else None,
        timestamp=datetime.now()
    )
    session.add(ai_msg_db)
    thread.updated_at = datetime.now()
    session.add(thread)
    session.commit()

    return {
        "role": "assistant",
        "content": last_message.content,
        "conversationId": thread_id,
        "threadMode": router_decision
    }


# ============================================================================
# HITL (Human-in-the-Loop) - 流式恢复接口
# ============================================================================

@router.post("/chat/resume")
async def resume_chat(
    request: ResumeRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """
    恢复被中断的 HITL 流程（流式响应）
    
    当用户在前端审核计划后，调用此接口继续执行。
    返回 SSE 流，包含后续所有任务执行事件。
    """
    print(f"[HITL RESUME] thread_id={request.thread_id}, approved={request.approved}")
    
    # 验证 thread 存在且属于当前用户
    thread = session.get(Thread, request.thread_id)
    if not thread:
        raise NotFoundError(f"Thread not found: {request.thread_id}")
    if thread.user_id != current_user.id:
        raise AuthorizationError("无权访问此线程")
    
    # 如果用户拒绝，清理状态并结束流程
    if not request.approved:
        print(f"[HITL RESUME] 用户拒绝了计划，清理状态")
        
        # 🔥 清理 LangGraph checkpoint（避免僵尸状态）
        try:
            # Windows 兼容：使用同步连接清理
            import psycopg
            db_url = os.getenv("DATABASE_URL", "")
            db_url = db_url.replace("postgresql+asyncpg", "postgresql").replace("postgresql+psycopg", "postgresql")
            
            with psycopg.connect(db_url) as conn:
                with conn.cursor() as cur:
                    # 先检查表是否存在
                    cur.execute("""
                        SELECT EXISTS (
                            SELECT FROM information_schema.tables 
                            WHERE table_name = 'checkpoints'
                        )
                    """)
                    if cur.fetchone()[0]:
                        cur.execute(
                            "DELETE FROM checkpoints WHERE thread_id = %s",
                            (request.thread_id,)
                        )
                        deleted = cur.rowcount
                        print(f"[HITL RESUME] 清理了 {deleted} 个 checkpoint(s)")
                    else:
                        print("[HITL RESUME] checkpoints 表不存在，跳过清理")
                conn.commit()
        except Exception as e:
            # 如果表不存在或其他错误，记录但不阻断流程
            print(f"[HITL RESUME WARN] 清理 checkpoint 失败: {e}")
        
        # 🔥 更新 task_session 状态为 cancelled（如果存在）
        try:
            task_session = session.exec(
                select(TaskSession).where(TaskSession.thread_id == request.thread_id)
            ).first()
            if task_session:
                task_session.status = "cancelled"
                task_session.final_response = "计划被用户取消"
                task_session.updated_at = datetime.now()
                session.add(task_session)
                session.commit()
                print(f"[HITL RESUME] TaskSession {task_session.session_id} 已标记为 cancelled")
        except Exception as e:
            print(f"[HITL RESUME WARN] 更新 task_session 失败: {e}")
        
        return {"status": "cancelled", "message": "计划已被用户拒绝"}
    
    # 🔥 流式恢复执行
    async def resume_stream_generator():
        """流式恢复生成器"""
        async with get_db_connection() as conn:
            checkpointer = AsyncPostgresSaver(conn)
            graph = create_smart_router_workflow(checkpointer=checkpointer)
            
            # 🔥🔥🔥 创建共享队列用于实时流式推送
            stream_queue = asyncio.Queue()
            
            config = {
                "recursion_limit": 100,
                "configurable": {
                    "thread_id": request.thread_id,
                    "stream_queue": stream_queue  # 🔥 传递给 aggregator 用于实时推送
                }
            }
            
            # 1. 如果用户修改了计划，更新状态
            if request.updated_plan:
                print(f"[HITL RESUME] 更新计划，任务数: {len(request.updated_plan)}")
                
                # 🔥🔥🔥 清理已删除任务的依赖关系
                # 获取当前保留的任务ID集合
                kept_task_ids = {task.get("id") for task in request.updated_plan}
                print(f"[HITL RESUME] 保留的任务ID: {kept_task_ids}")
                
                # 清理每个任务的 depends_on 中指向已删除任务的依赖
                cleaned_plan = []
                for task in request.updated_plan:
                    cleaned_task = dict(task)
                    if cleaned_task.get("depends_on"):
                        original_deps = cleaned_task["depends_on"]
                        # 只保留指向仍然存在任务的依赖
                        cleaned_deps = [dep for dep in original_deps if dep in kept_task_ids]
                        if len(cleaned_deps) != len(original_deps):
                            print(f"[HITL RESUME] 任务 {cleaned_task.get('id')} 的依赖已清理: {original_deps} -> {cleaned_deps}")
                        cleaned_task["depends_on"] = cleaned_deps if cleaned_deps else None
                    cleaned_plan.append(cleaned_task)
                
                await graph.aupdate_state(config, {"task_list": cleaned_plan})
            
            # 2. 🔥🔥🔥 流式恢复执行（必须使用 astream_events 保持 SSE）
            # 传入 None 作为 input，LangGraph 自动从断点继续
            
            # 🔥 创建两个队列：
            # - realtime_queue: 给 aggregator 用于实时推送 message.delta
            # - sse_queue: 用于收集所有 SSE 事件发送给前端
            realtime_queue = asyncio.Queue()  # aggregator 实时推送用
            sse_queue = asyncio.Queue()       # SSE 输出给前端用
            
            config = {
                "recursion_limit": 100,
                "configurable": {
                    "thread_id": request.thread_id,
                    "stream_queue": realtime_queue  # 🔥 传递给 aggregator
                }
            }
            
            # 🔥🔥🔥 首先发送 plan.created 事件，初始化前端 thinking 步骤
            plan_tasks = request.updated_plan if request.updated_plan else []
            if plan_tasks:
                from event_types.events import EventType, PlanCreatedData, build_sse_event
                from utils.event_generator import sse_event_to_string
                
                plan_event = build_sse_event(
                    EventType.PLAN_CREATED,
                    PlanCreatedData(
                        session_id=request.thread_id,
                        tasks=[
                            {
                                "id": task.get("id", f"task-{i}"),
                                "expert_type": task.get("expert_type", "unknown"),
                                "description": task.get("description", ""),
                                "sort_order": task.get("sort_order", i),
                                "status": task.get("status", "pending")
                            }
                            for i, task in enumerate(plan_tasks)
                        ],
                        estimated_steps=len(plan_tasks),
                        execution_mode="sequential",
                        summary=f"恢复执行 {len(plan_tasks)} 个任务"
                    ),
                    str(uuid4())
                )
                await sse_queue.put({
                    "type": "sse",
                    "event": sse_event_to_string(plan_event)
                })
                print(f"[HITL RESUME] 已发送 plan.created 事件，任务数: {len(plan_tasks)}")
            
            async def producer():
                """生产者：运行 LangGraph，将事件转换为 SSE 放入队列"""
                try:
                    print(f"[RESUME PRODUCER] 开始流式恢复执行...")
                    event_count = 0
                    loop_count = 0
                    realtime_event_count = 0
                    
                    # 🔥🔥🔥 创建独立任务持续收集 realtime_queue 事件
                    # 避免在 graph.astream_events 循环内部收集导致的时序问题
                    realtime_events_collector = []
                    collector_task = None
                    
                    async def collect_realtime_events():
                        """独立协程：持续收集 realtime_queue 事件"""
                        nonlocal realtime_event_count
                        while True:
                            try:
                                realtime_event = await asyncio.wait_for(realtime_queue.get(), timeout=0.5)
                                if realtime_event and realtime_event.get("type") == "sse":
                                    realtime_events_collector.append(realtime_event)
                                    realtime_event_count += 1
                                    if realtime_event_count % 10 == 0:
                                        print(f"[RESUME PRODUCER] 已收集 {realtime_event_count} 个 realtime 事件")
                            except asyncio.TimeoutError:
                                continue
                            except Exception as e:
                                print(f"[RESUME PRODUCER] 收集 realtime 事件错误: {e}")
                                break
                    
                    # 启动收集器协程
                    collector_task = asyncio.create_task(collect_realtime_events())
                    
                    # 🔥🔥🔥 循环执行直到所有任务完成（处理多轮中断）
                    while True:
                        loop_count += 1
                        print(f"[RESUME PRODUCER] 第 {loop_count} 轮执行...")
                        
                        async for event in graph.astream_events(
                            None,  # 从 checkpoint 继续
                            config=config,
                            version="v2"
                        ):
                            kind = event.get("event", "")
                            name = event.get("name", "")
                            data = event.get("data", {})
                            
                            # 🔥🔥🔥 处理节点返回的 event_queue 事件
                            if kind == "on_chain_end":
                                output_data = data.get("output", {})
                                
                                if isinstance(output_data, dict):
                                    event_queue = output_data.get("event_queue", [])
                                    for queued_event in event_queue:
                                        if queued_event.get("type") == "sse":
                                            await sse_queue.put({
                                                "type": "sse",
                                                "event": queued_event["event"]
                                            })
                                            event_count += 1
                                            
                                    if event_queue:
                                        print(f"[RESUME PRODUCER] 节点 '{name}' 返回 {len(event_queue)} 个事件")
                            
                            # 处理 aggregator 完成
                            if kind == "on_chain_end" and name == "aggregator":
                                print(f"[RESUME PRODUCER] Aggregator 完成")
                        
                        # 🔥🔥🔥 将收集到的 realtime 事件发送到 sse_queue
                        if realtime_events_collector:
                            flush_count = len(realtime_events_collector)
                            for evt in realtime_events_collector:
                                await sse_queue.put(evt)
                                event_count += 1
                            realtime_events_collector.clear()
                            print(f"[RESUME PRODUCER] 本轮刷新 {flush_count} 个 realtime 事件")
                        
                        # 检查是否完成或再次中断
                        snapshot = await graph.aget_state(config)
                        if not snapshot.next:
                            # 等待收集器完成
                            if collector_task and not collector_task.done():
                                collector_task.cancel()
                                try:
                                    await collector_task
                                except asyncio.CancelledError:
                                    pass
                            # 最后刷新一次 realtime 事件
                            if realtime_events_collector:
                                for evt in realtime_events_collector:
                                    await sse_queue.put(evt)
                                    event_count += 1
                            print(f"[RESUME PRODUCER] 所有任务完成，共 {event_count} 个事件 (realtime: {realtime_event_count})")
                            break
                        
                        print(f"[RESUME PRODUCER] 检测到中断，自动继续执行...")
                    
                    # 发送 message.done
                    await sse_queue.put({
                        "type": "sse",
                        "event": f"event: message.done\ndata: {json.dumps({'type': 'message.done'})}\n\n"
                    })
                        
                except Exception as e:
                    print(f"[RESUME PRODUCER] 错误: {e}")
                    import traceback
                    traceback.print_exc()
                    await sse_queue.put({"type": "graph_error", "error": str(e)})
                finally:
                    await sse_queue.put(None)
            
            # 启动生产者
            producer_task = asyncio.create_task(producer())
            
            # 消费并 yield SSE
            try:
                while True:
                    try:
                        token = await asyncio.wait_for(sse_queue.get(), timeout=1.0)
                    except asyncio.TimeoutError:
                        if producer_task.done():
                            while not sse_queue.empty():
                                item = sse_queue.get_nowait()
                                if item is None:
                                    break
                                if item.get("type") == "sse":
                                    yield item["event"]
                                elif item.get("type") == "hitl_interrupt":
                                    yield f"event: human.interrupt\ndata: {json.dumps(item['data'])}\n\n"
                                elif item.get("type") == "graph_error":
                                    yield f"event: error\ndata: {json.dumps({'error': item.get('error')})}\n\n"
                            break
                        yield ": keep-alive\n\n"
                        continue
                    
                    if token is None:
                        break
                    
                    if token.get("type") == "sse":
                        yield token["event"]
                    elif token.get("type") == "hitl_interrupt":
                        yield f"event: human.interrupt\ndata: {json.dumps(token['data'])}\n\n"
                    elif token.get("type") == "graph_error":
                        yield f"event: error\ndata: {json.dumps({'error': token.get('error')})}\n\n"
                        
            finally:
                if not producer_task.done():
                    producer_task.cancel()
    
    return StreamingResponse(
        resume_stream_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


def format_resume_event(token: dict) -> Optional[str]:
    """格式化恢复流中的事件为 SSE"""
    if token.get("type") == "graph_error":
        error_msg = token.get("error", "未知错误")
        event_payload = {"type": "error", "message": error_msg}
        return f"event: error\ndata: {json.dumps(event_payload)}\n\n"
    
    elif token.get("type") == "hitl_interrupt":
        interrupt_data = token.get("data", {})
        event_payload = {"type": "human.interrupt", "data": interrupt_data}
        return f"event: human.interrupt\ndata: {json.dumps(event_payload)}\n\n"
    
    elif token.get("type") == "graph_event":
        event = token["event"]
        kind = event.get("event", "")
        name = event.get("name", "")
        data = event.get("data", {})
        
        # 🔥🔥🔥 处理 task 相关事件（从 event_queue 中提取）
        if kind == "on_chain_end":
            output_data = data.get("output", {})
            if isinstance(output_data, dict):
                event_queue = output_data.get("event_queue", [])
                for queued_event in event_queue:
                    if queued_event.get("type") == "sse":
                        return queued_event["event"]
        
        # 🔥🔥🔥 处理 generic worker 节点（task 执行）
        if kind == "on_chain_start" and name == "generic":
            # 任务开始
            input_data = data.get("input", {})
            task_list = input_data.get("task_list", [])
            current_index = input_data.get("current_task_index", 0)
            if task_list and current_index < len(task_list):
                task = task_list[current_index]
                event_payload = {
                    "type": "task.started",
                    "data": {
                        "task_id": task.get("id"),
                        "expert_type": task.get("expert_type"),
                        "description": task.get("description"),
                        "started_at": datetime.now().isoformat()
                    }
                }
                return f"event: task.started\ndata: {json.dumps(event_payload)}\n\n"
        
        if kind == "on_chain_end" and name == "generic":
            # 任务完成
            output_data = data.get("output", {})
            task_result = output_data.get("__task_result", {})
            if task_result:
                event_payload = {
                    "type": "task.completed",
                    "data": {
                        "task_id": task_result.get("task_id"),
                        "expert_type": task_result.get("expert_type"),
                        "status": "completed",
                        "completed_at": datetime.now().isoformat()
                    }
                }
                return f"event: task.completed\ndata: {json.dumps(event_payload)}\n\n"
        
        # 🔥 处理 message.done 事件（流结束标志）
        if kind == "on_chain_end" and name == "aggregator":
            return f"event: message.done\ndata: {json.dumps({'type': 'message.done'})}\n\n"
    
    return None
