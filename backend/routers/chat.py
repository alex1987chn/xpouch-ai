"""
聊天路由模块 - 包含主要聊天端点和线程管理
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
from utils.artifacts import parse_artifacts_from_response, generate_artifact_event
from utils.llm_factory import get_llm_instance
from agents.graph import commander_graph
from utils.exceptions import AppError, NotFoundError, AuthorizationError


router = APIRouter(prefix="/api", tags=["chat"])


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


# ============================================================================
# 流式输出过滤函数
# ============================================================================

def should_stream_event(event_tags: list, router_mode: str, name: str = "") -> tuple[bool, str]:
    """
    判断是否应该将当前事件流式输出到前端
    
    Args:
        event_tags: 事件标签列表
        router_mode: 当前路由模式 ("", "simple", "complex")
        name: 事件名称（用于调试）
    
    Returns:
        tuple[bool, str]: (是否应输出, 跳过原因)

    过滤规则：
    - Router 模式未知时: 跳过所有内部节点 (router/planner/expert)
    - Simple 模式: 只允许 direct_reply 节点
    - Complex 模式: 跳过内部节点，保留 Aggregator 输出
    """
    tags_str = str(event_tags).lower()
    
    # Router 决策未知时，跳过所有内部节点
    if router_mode == "":
        if any(tag in tags_str for tag in ["router", "commander", "planner", "expert"]):
            return False, f"Router 决策未知，跳过内部节点: {tags_str}"
    
    # Simple 模式：只允许 direct_reply 节点
    elif router_mode == "simple":
        if "direct_reply" not in tags_str:
            return False, f"Simple 模式：跳过非 direct_reply: {tags_str}"
    
    # Complex 模式：跳过内部规划节点和专家
    else:  # router_mode == "complex"
        if any(tag in tags_str for tag in ["router", "commander", "planner", "expert"]):
            return False, f"Complex 模式：跳过内部节点: {tags_str}"
    
    return True, "通过过滤"


def is_task_plan_content(content: str) -> bool:
    """
    检查内容是否是任务计划 JSON
    
    用于过滤掉不应展示给用户的内部任务计划数据
    """
    if not content:
        return False
    
    content_stripped = content.strip()
    
    # 移除 Markdown 代码块标记
    code_block_match = re.match(r'^```(?:json)?\s*([\s\S]*?)\s*```$', content_stripped)
    if code_block_match:
        content_stripped = code_block_match.group(1).strip()
    
    # 检查是否是 JSON 格式的任务计划
    if content_stripped.startswith('{'):
        content_lower = content_stripped.lower()
        if (('"tasks"' in content_lower and '"strategy"' in content_lower) or
            ('"tasks"' in content_lower and '"expert_type"' in content_lower) or
            ('"estimated_steps"' in content_lower)):
            return True
    
    return False


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
    
    # 构建响应
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
            # 加载SubTasks
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
                        "extra_data": msg.extra_data  # 👈 新增：返回 extra_data（原 metadata）
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

    # 对于非AI线程，返回基本信息
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
                "extra_data": msg.extra_data  # 👈 新增：返回 extra_data（原 metadata）
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
    
    - 自定义智能体：直接调用 LLM，不经过 LangGraph
    - 系统默认助手：通过 LangGraph (Router -> Planner -> Experts) 处理
    """
    # 1. 确定 Thread ID
    thread_id = request.conversationId
    thread = None

    if thread_id:
        thread = session.get(Thread, thread_id)
        if thread and thread.user_id != current_user.id:
            raise AuthorizationError("没有权限访问此会话")

    if not thread:
        # 如果没有ID或找不到，创建新线程
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
                custom_agent, langchain_messages, thread_id, thread
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
            initial_state, thread_id, thread, request.message, session
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
    thread: Thread
) -> StreamingResponse:
    """处理自定义智能体流式响应"""
    async def event_generator():
        full_response = ""
        try:
            model_name = custom_agent.model_id or os.getenv("MODEL_NAME", "deepseek-chat")
            base_url = os.getenv("OPENAI_BASE_URL") or os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")
            
            # 自动修正：如果使用 DeepSeek API 但 model_id 是 OpenAI 模型
            if "deepseek.com" in base_url and model_name.startswith("gpt-"):
                print(f"[CUSTOM AGENT] 检测到不兼容模型 {model_name}，自动切换为 deepseek-chat")
                model_name = "deepseek-chat"

            print(f"[CUSTOM AGENT] 使用模型: {model_name}")
            
            llm = get_llm_instance(streaming=True, model=model_name, temperature=0.7)

            messages_with_system = [("system", custom_agent.system_prompt)]
            messages_with_system.extend(langchain_messages)

            async for chunk in llm.astream(messages_with_system):
                content = chunk.content
                if content:
                    full_response += content
                    yield f"data: {json.dumps({'content': content, 'conversationId': thread_id})}\n\n"

        except Exception as e:
            import traceback
            traceback.print_exc()
            error_msg = json.dumps({"error": str(e)})
            yield f"data: {error_msg}\n\n"

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
                thread = inner_session.get(Thread, thread_id)
                if thread:
                    thread.updated_at = datetime.now()
                    inner_session.add(thread)
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
# LangGraph 处理函数
# ============================================================================

async def _handle_langgraph_stream(
    initial_state: dict,
    thread_id: str,
    thread: Thread,
    user_message: str,
    session: Session
) -> StreamingResponse:
    """处理 LangGraph 流式响应"""
    async def event_generator():
        full_response = ""
        event_count = 0
        expert_artifacts = {}
        collected_task_list = []
        collected_expert_results = []
        router_mode = ""
        thinking_steps = []  # 👈 新增：收集 thinking 步骤

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

                # 捕获 Router 节点执行结束
                if kind == "on_chain_end" and name == "router":
                    output_data = event["data"]["output"]
                    router_decision = output_data.get("router_decision", "")

                    if router_decision:
                        print(f"[STREAM] Router 决策: {router_decision}")
                        router_mode = router_decision
                        # 👈 只记录决策，不立即修改数据库（避免session生命周期冲突）
                        # thread状态将在streaming结束后统一更新
                        yield f"data: {json.dumps({'routerDecision': router_decision, 'conversationId': thread_id})}\n\n"

                # 捕获规划节点执行结束（planner 可能没有 on_chain_end，用流式输出中的标记）
                if kind == "on_chain_end" and name == "planner":
                    output_data = event["data"]["output"]
                    print(f"[DEBUG] Planner on_chain_end triggered!")
                    print(f"[DEBUG] Planner output keys: {list(output_data.keys())}")
                    
                    if "task_list" in output_data:
                        collected_task_list = output_data["task_list"]
                        print(f"[DEBUG] Collected task_list: {len(collected_task_list)} tasks")
                        
                        # 👈 新增：收集 planner 的 thinking
                        thinking_steps.append({
                            "id": str(uuid4()),
                            "expertType": "planner",
                            "expertName": "任务规划器",
                            "content": f"制定执行策略，拆解为 {len(collected_task_list)} 个子任务",
                            "timestamp": datetime.now().isoformat(),
                            "status": "completed"
                        })
                    else:
                        print(f"[WARN] No task_list in planner output!")
                    
                    if "__task_plan" in output_data:
                        task_plan = output_data["__task_plan"]
                        print(f"[STREAM] 发送 taskPlan 事件: {task_plan.get('task_count', 0)} 个任务")
                        yield f"data: {json.dumps({'taskPlan': task_plan, 'conversationId': thread_id})}\n\n"
                
                # 👈 备选：从流式输出中捕获 planner 的 JSON 输出
                if kind == "on_chat_model_stream" and router_mode == "complex":
                    event_tags = event.get("tags", [])
                    # 检查是否是 planner/commander 的输出
                    if any(tag in str(event_tags) for tag in ["planner", "commander"]):
                        content = event["data"]["chunk"].content
                        # 尝试解析 JSON 格式的 task_list
                        if content and '"tasks"' in content and not collected_task_list:
                            try:
                                import json
                                data = json.loads(content)
                                if "tasks" in data and isinstance(data["tasks"], list):
                                    collected_task_list = data["tasks"]
                                    print(f"[DEBUG] 从流式输出解析 task_list: {len(collected_task_list)} tasks")
                                    
                                    # 收集 thinking
                                    thinking_steps.append({
                                        "id": str(uuid4()),
                                        "expertType": "planner",
                                        "expertName": "任务规划器",
                                        "content": f"制定执行策略，拆解为 {len(collected_task_list)} 个子任务",
                                        "timestamp": datetime.now().isoformat(),
                                        "status": "completed"
                                    })
                                    
                                    # 发送 taskPlan 事件
                                    task_plan = {
                                        "task_count": len(collected_task_list),
                                        "tasks": collected_task_list
                                    }
                                    yield f"data: {json.dumps({'taskPlan': task_plan, 'conversationId': thread_id})}\n\n"
                            except:
                                pass  # 解析失败，忽略

                # 捕获 direct_reply 节点执行结束
                if kind == "on_chain_end" and name == "direct_reply":
                    yield f"data: {json.dumps({'content': '', 'conversationId': thread_id, 'isFinal': True})}\n\n"
                    print(f"[STREAM] Direct Reply 节点完成，Simple 模式流式输出结束")

                # 捕获聚合器节点执行结束
                if kind == "on_chain_end" and name == "aggregator":
                    output_data = event["data"]["output"]
                    if "final_response" in output_data:
                        final_response = output_data["final_response"]
                        yield f"data: {json.dumps({'content': final_response, 'conversationId': thread_id, 'isFinal': True})}\n\n"

                # 捕获专家分发器节点开始执行
                if kind == "on_chain_start" and name == "expert_dispatcher":
                    input_data = event.get("data", {}).get("input", {})
                    task_list = input_data.get("task_list", [])
                    current_task_index = input_data.get("current_task_index", 0)

                    if task_list and current_task_index < len(task_list):
                        current_task = task_list[current_task_index]
                        task_start_info = {
                            "task_index": current_task_index + 1,
                            "total_tasks": len(task_list),
                            "expert_type": current_task.get("expert_type", ""),
                            "description": current_task.get("description", "")
                        }
                        yield f"data: {json.dumps({'taskStart': task_start_info, 'conversationId': thread_id})}\n\n"

                # 捕获专家分发器节点执行
                if kind == "on_chain_end" and name == "expert_dispatcher":
                    output_data = event["data"]["output"]

                    if "__expert_info" in output_data:
                        expert_info = output_data["__expert_info"]
                        expert_name = expert_info.get("expert_type")
                        expert_status = expert_info.get("status", "completed")
                        duration_ms = expert_info.get("duration_ms", 0)
                        output_result = expert_info.get("output", "")
                        expert_error = expert_info.get("error")

                        if expert_name not in expert_artifacts:
                            expert_artifacts[expert_name] = []
                        
                        # 👈 新增：收集 expert 的 thinking
                        thinking_steps.append({
                            "id": str(uuid4()),
                            "expertType": expert_name,
                            "expertName": expert_name,
                            "content": expert_info.get("description", f"{expert_name} 执行任务"),
                            "timestamp": datetime.now().isoformat(),
                            "status": "completed" if expert_status == "completed" else "failed"
                        })

                        yield f"data: {json.dumps({'activeExpert': expert_name, 'conversationId': thread_id})}\n\n"

                        if "artifact" in output_data:
                            artifact = output_data["artifact"]
                            expert_artifacts[expert_name].append(artifact)
                            yield f"data: {json.dumps({'artifact': artifact, 'conversationId': thread_id, 'allArtifacts': expert_artifacts[expert_name], 'activeExpert': expert_name})}\n\n"

                        yield f"data: {json.dumps({
                            'expertCompleted': expert_name,
                            'description': expert_info.get('description', ''),
                            'conversationId': thread_id,
                            'duration_ms': duration_ms,
                            'status': expert_status,
                            'output': output_result,
                            'error': expert_error,
                            'allArtifacts': expert_artifacts.get(expert_name, [])
                        })}\n\n"

                # 捕获 LLM 流式输出
                if kind == "on_chat_model_stream":
                    event_tags = event.get("tags", [])
                    content = event["data"]["chunk"].content
                    
                    # 👈 调试：打印所有 on_chat_model_stream 事件的标签
                    if event_count % 5 == 0:
                        print(f"[STREAM DEBUG] on_chat_model_stream: tags={event_tags}, name={name}, router_mode={router_mode}")

                    should_yield, reason = should_stream_event(event_tags, router_mode, name)
                    if not should_yield:
                        print(f"[STREAM] {reason}")
                        continue

                    if is_task_plan_content(content):
                        print(f"[STREAM] 跳过任务计划JSON内容: {content[:200]}...")
                        continue

                    if content:
                        print(f"[STREAM] 通过过滤的流式输出: content[:50]={content[:50]}")
                        full_response += content
                        yield f"data: {json.dumps({'content': content, 'conversationId': thread_id})}\n\n"

            print(f"[STREAM] 流式处理完成，共处理 {event_count} 个事件")

        except Exception as e:
            print(f"[STREAM] 错误: {e}")
            import traceback
            traceback.print_exc()
            error_msg = json.dumps({"error": str(e)})
            yield f"data: {error_msg}\n\n"

        # 保存 AI 回复和 Artifacts 到数据库（使用独立的短生命周期Session）
        if full_response:
            with Session(engine) as save_session:
                # 1. 保存 AI 消息（包含 thinking 数据）
                extra_data = None
                if thinking_steps:
                    extra_data = {
                        "thinking": thinking_steps,
                        "thinking_count": len(thinking_steps)
                    }
                    print(f"[STREAM] 保存 thinking 数据: {len(thinking_steps)} 个步骤")
                
                ai_msg_db = Message(
                    thread_id=thread_id,
                    role="assistant",
                    content=full_response,
                    timestamp=datetime.now(),
                    extra_data=extra_data
                )
                save_session.add(ai_msg_db)

                # 2. 更新 thread 状态（应用 router 决策）
                thread_obj = save_session.get(Thread, thread_id)
                if thread_obj:
                    thread_obj.updated_at = datetime.now()

                    # 应用 router 决策（如果在streaming过程中收集到了）
                    if router_mode:
                        thread_obj.thread_mode = router_mode
                        print(f"[STREAM] 更新 thread_mode 为: {router_mode}")

                    # 3. 如果是复杂模式，保存 TaskSession 和 SubTask
                    print(f"[DEBUG] Checking save condition: router_mode={router_mode}, task_list_len={len(collected_task_list)}")
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
