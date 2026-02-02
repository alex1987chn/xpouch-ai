"""
聊天路由模块 - 包含主要聊天端点和线程管理
v3.0: 复杂模式使用新的事件协议（plan.created, task.started, task.completed, artifact.generated, message.delta）
"""
import os
import json
import re
from datetime import datetime
from typing import List, Optional, AsyncGenerator
from uuid import uuid4

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlmodel import Session, select
from sqlalchemy.orm import selectinload
from langchain_core.messages import HumanMessage, AIMessage

from database import get_session, engine
from dependencies import get_current_user, get_current_user_with_auth
from models import (
    User, Thread, Message, CustomAgent, TaskSession, SubTask
)
from constants import (
    normalize_agent_id,
    SYSTEM_AGENT_ORCHESTRATOR,
    SYSTEM_AGENT_DEFAULT_CHAT
)
from utils.llm_factory import get_llm_instance
from agents.graph import commander_graph
from utils.exceptions import AppError, NotFoundError, AuthorizationError


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
    if thread.agent_type == "ai" and thread.task_session_id:
        task_session = session.get(TaskSession, thread.task_session_id)
        if task_session:
            statement = select(SubTask).where(SubTask.task_session_id == task_session.session_id)
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
                            "output": st.output,
                            "error": st.error,
                            "artifacts": st.artifacts,
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
            return await _handle_custom_agent_stream(
                custom_agent, langchain_messages, thread_id, thread, request.message_id
            )
        else:
            return await _handle_custom_agent_sync(
                custom_agent, langchain_messages, thread_id, thread, session
            )

    # 系统默认助手模式：通过 LangGraph 处理
    print(f"[CHAT] 进入系统默认助手模式，使用 LangGraph 处理")

    initial_state = {
        "messages": langchain_messages,
        "current_agent": "router",
        "task_list": [],
        "current_task_index": 0,
        "strategy": "",
        "expert_results": [],
        "final_response": "",
        "context": {},
        "router_decision": ""
    }

    if request.stream:
        return await _handle_langgraph_stream(
            initial_state, thread_id, thread, request.message, session, request.message_id
        )
    else:
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
    """处理自定义智能体流式响应 (v3.0 新协议)"""
    async def event_generator():
        full_response = ""
        # v3.0: 确保使用一致的 message_id
        actual_message_id = message_id or str(uuid4())
        try:
            model_name = custom_agent.model_id or os.getenv("MODEL_NAME", "deepseek-chat")
            base_url = os.getenv("OPENAI_BASE_URL") or os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")
            
            if "deepseek.com" in base_url and model_name.startswith("gpt-"):
                print(f"[CUSTOM AGENT] 检测到不兼容模型 {model_name}，自动切换为 deepseek-chat")
                model_name = "deepseek-chat"

            print(f"[CUSTOM AGENT] 使用模型: {model_name}，消息ID: {actual_message_id}")
            
            llm = get_llm_instance(streaming=True, model=model_name, temperature=0.7)

            messages_with_system = [("system", custom_agent.system_prompt)]
            messages_with_system.extend(langchain_messages)

            async for chunk in llm.astream(messages_with_system):
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

        # v3.0: 发送 message.done 事件（新协议）
        # 使用与 delta 事件相同的 actual_message_id
        from event_types.events import EventType, MessageDoneData, build_sse_event
        done_event = build_sse_event(
            EventType.MESSAGE_DONE,
            MessageDoneData(
                message_id=actual_message_id,
                full_content=full_response
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
                content=full_response,
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
    model_name = custom_agent.model_id or os.getenv("MODEL_NAME", "deepseek-chat")
    base_url = os.getenv("OPENAI_BASE_URL") or os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")

    if "deepseek.com" in base_url and model_name.startswith("gpt-"):
        model_name = "deepseek-chat"

    llm = get_llm_instance(streaming=False, model=model_name, temperature=0.7)
    
    messages_with_system = [("system", custom_agent.system_prompt)]
    messages_with_system.extend(langchain_messages)
    
    result = await llm.ainvoke(messages_with_system)
    full_response = result.content

    # 保存 AI 回复
    ai_msg_db = Message(
        thread_id=thread_id,
        role="assistant",
        content=full_response,
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
    """
    async def event_generator():
        full_response = ""
        event_count = 0
        router_mode = ""
        
        # v3.0: 收集任务列表和产物（用于最终保存）
        collected_task_list = []
        expert_artifacts = {}
        
        # v3.0: 在 initial_state 中注入数据库会话和 thread_id
        initial_state["db_session"] = session
        initial_state["thread_id"] = thread_id
        initial_state["event_queue"] = []
        initial_state["message_id"] = message_id  # v3.0: 注入前端传递的助手消息 ID

        try:
            async for event in commander_graph.astream_events(
                initial_state,
                version="v2"
            ):
                event_count += 1
                kind = event["event"]
                name = event.get("name", "")
                
                if event_count % 10 == 0:
                    print(f"[STREAM] 已处理 {event_count} 个事件，当前: {kind} - {name}")

                # v3.0: 处理节点返回的 event_queue（新协议事件）
                if kind == "on_chain_end":
                    output_data = event["data"].get("output", {})
                    
                    if isinstance(output_data, dict):
                        event_queue = output_data.get("event_queue", [])
                        
                        # 收集任务列表（从 planner 节点）
                        if output_data.get("task_list"):
                            collected_task_list = output_data["task_list"]
                            
                        # 收集产物（从 expert_dispatcher 节点）
                        if output_data.get("__expert_info"):
                            expert_info = output_data["__expert_info"]
                            expert_type = expert_info.get("expert_type")
                            if expert_type and output_data.get("artifact"):
                                if expert_type not in expert_artifacts:
                                    expert_artifacts[expert_type] = []
                                expert_artifacts[expert_type].append(output_data["artifact"])
                    else:
                        event_queue = []
                    
                    # 发送 event_queue 中的所有事件（新协议）
                    for queued_event in event_queue:
                        if queued_event.get("type") == "sse":
                            yield queued_event["event"]
                            
                            # 解析 message.delta 事件以累积内容
                            try:
                                event_lines = queued_event["event"].strip().split('\n')
                                event_data_str = ""
                                for line in event_lines:
                                    if line.startswith('data: '):
                                        event_data_str = line[6:]
                                        break
                                
                                if event_data_str:
                                    event_data = json.loads(event_data_str)
                                    if event_data.get('type') == 'message.delta':
                                        full_response += event_data.get('data', {}).get('content', '')
                            except Exception as e:
                                if DEBUG:
                                    print(f"[STREAM] 解析事件失败: {e}")

                # 捕获 Router 节点执行结束
                if kind == "on_chain_end" and name == "router":
                    output_data = event["data"]["output"]
                    router_decision = output_data.get("router_decision", "")

                    if router_decision:
                        print(f"[STREAM] Router 决策: {router_decision}")
                        router_mode = router_decision
                        # v3.0: 发送 router.decision 事件（新协议）
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
                    # v3.0: Simple 模式使用 message.done 事件
                    from event_types.events import EventType, MessageDoneData, build_sse_event
                    done_event = build_sse_event(
                        EventType.MESSAGE_DONE,
                        MessageDoneData(message_id=message_id or str(uuid4()), full_content=full_response),
                        str(uuid4())
                    )
                    from utils.event_generator import sse_event_to_string
                    yield sse_event_to_string(done_event)
                    print(f"[STREAM] Direct Reply 节点完成")

                # 捕获 LLM 流式输出（Simple 模式）
                if kind == "on_chat_model_stream" and router_mode == "simple":
                    content = event["data"]["chunk"].content
                    if content:
                        full_response += content
                        # v3.0: Simple 模式也使用 message.delta 事件
                        from event_types.events import EventType, MessageDeltaData, build_sse_event
                        delta_event = build_sse_event(
                            EventType.MESSAGE_DELTA,
                            MessageDeltaData(message_id=message_id or str(uuid4()), content=content),
                            str(uuid4())
                        )
                        from utils.event_generator import sse_event_to_string
                        yield sse_event_to_string(delta_event)

            print(f"[STREAM] 流式处理完成，共处理 {event_count} 个事件")

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
            with Session(engine) as save_session:
                ai_msg_db = Message(
                    thread_id=thread_id,
                    role="assistant",
                    content=full_response,
                    timestamp=datetime.now()
                )
                save_session.add(ai_msg_db)

                thread_obj = save_session.get(Thread, thread_id)
                if thread_obj:
                    thread_obj.updated_at = datetime.now()

                    if router_mode:
                        thread_obj.thread_mode = router_mode
                        print(f"[STREAM] 更新 thread_mode 为: {router_mode}")

                    # 复杂模式：保存 TaskSession 和 SubTask
                    if router_mode == "complex" and collected_task_list:
                        print(f"[STREAM] 保存复杂模式数据: {len(collected_task_list)} 个任务")

                        now = datetime.now()
                        task_session = TaskSession(
                            session_id=str(uuid4()),
                            thread_id=thread_id,
                            user_query=user_message,
                            status="completed",
                            final_response=full_response,
                            created_at=now,
                            updated_at=now,
                            completed_at=now
                        )
                        save_session.add(task_session)
                        save_session.flush()

                        thread_obj.task_session_id = task_session.session_id
                        thread_obj.agent_type = "ai"
                        save_session.add(thread_obj)

                        for task in collected_task_list:
                            expert_type = task.get("expert_type", "")
                            artifacts_for_expert = expert_artifacts.get(expert_type, [])

                            subtask = SubTask(
                                id=task.get("id", str(uuid4())),
                                expert_type=expert_type,
                                task_description=task.get("description", ""),
                                input_data=task.get("input_data", {}),
                                status=task.get("status", "completed"),
                                output_result={"content": task.get("output_result", "")},
                                artifacts=artifacts_for_expert,
                                task_session_id=task_session.session_id,
                                started_at=task.get("started_at"),
                                completed_at=task.get("completed_at"),
                                created_at=task.get("created_at"),
                                updated_at=task.get("updated_at"),
                            )
                            save_session.add(subtask)
                            print(f"[STREAM] 保存 SubTask: {expert_type}, artifacts: {len(artifacts_for_expert)}")

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
    """处理 LangGraph 非流式响应"""
    result = await commander_graph.ainvoke(initial_state)
    last_message = result["messages"][-1]

    # 获取 Router 决策并更新 thread_mode
    router_decision = result.get("router_decision", "simple")
    thread.thread_mode = router_decision

    # 如果是复杂模式，设置 agent_type 为 "ai"
    if router_decision == "complex":
        thread.agent_type = "ai"

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
    ai_msg_db = Message(
        thread_id=thread_id,
        role="assistant",
        content=last_message.content,
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
