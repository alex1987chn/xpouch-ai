"""
聊天路由模块 - XPouch AI 核心 API (重构后)

[职责]
提供聊天相关的 RESTful API 和 SSE 流式接口。
Router 层仅负责：
- 定义 API 端点
- 参数校验 (Pydantic Models)
- 依赖注入 (FastAPI Depends)
- 调用 Service 层方法
- 返回 Response

[业务逻辑]
所有业务逻辑已迁移至 backend.services.chat/ 服务层：
- ChatSessionService: 会话生命周期管理
- StreamService: SSE 流式处理
- ArtifactService: Artifact 业务处理
- RecoveryService: HITL 恢复逻辑

[端点]
- POST /api/chat: 主聊天接口（SSE 流式）
- POST /api/chat/resume: HITL 恢复执行
- PATCH /api/artifacts/{id}: Artifact 内容更新
- GET /api/threads: 获取会话列表
- GET /api/threads/{id}: 获取会话详情
- DELETE /api/threads/{id}: 删除会话
"""
from typing import List, Optional, Dict, Any
from datetime import datetime

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlmodel import Session

from database import get_session
from dependencies import get_current_user, get_current_user_with_auth
from models import User, Thread, Message
from utils.exceptions import NotFoundError, AuthorizationError

# 🔥 Service 层导入（backend 是 Python 路径根）
from services.chat.session_service import ChatSessionService
from services.chat.stream_service import StreamService
from services.chat.artifact_service import ArtifactService
from services.chat.recovery_service import RecoveryService


router = APIRouter(prefix="/api", tags=["chat"])


# ============================================================================
# Pydantic 请求/响应模型
# ============================================================================

class ChatMessageDTO(BaseModel):
    """聊天消息 DTO"""
    role: str
    content: str
    id: Optional[str] = None
    timestamp: Optional[str] = None


class ChatRequest(BaseModel):
    """聊天请求"""
    message: str
    history: List[ChatMessageDTO]
    conversation_id: Optional[str] = None
    agent_id: Optional[str] = "assistant"
    stream: Optional[bool] = True
    message_id: Optional[str] = None


class ResumeRequest(BaseModel):
    """HITL 恢复请求"""
    thread_id: str
    updated_plan: Optional[List[Dict[str, Any]]] = None
    approved: bool = True
    message_id: Optional[str] = None  # 前端传入的消息ID，用于关联流式输出


class ArtifactUpdateRequest(BaseModel):
    """Artifact 更新请求"""
    content: str


class ArtifactUpdateResponse(BaseModel):
    """Artifact 更新响应"""
    id: str
    type: str
    title: Optional[str]
    content: str
    language: Optional[str]
    sort_order: int
    updated: bool


# ============================================================================
# 线程管理 API
# ============================================================================

@router.get("/threads")
async def get_threads(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """获取当前用户的所有线程列表"""
    service = ChatSessionService(session)
    return await service.list_threads(current_user.id)


@router.get("/threads/{thread_id}")
async def get_thread(
    thread_id: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """获取单个线程详情（包含 TaskSession/SubTasks/Artifacts）"""
    service = ChatSessionService(session)
    return await service.get_thread_detail(thread_id, current_user.id)


@router.delete("/threads/{thread_id}")
async def delete_thread(
    thread_id: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """删除线程"""
    service = ChatSessionService(session)
    await service.delete_thread(thread_id, current_user.id)
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
    
    - 自定义智能体：直接流式调用
    - 系统默认助手：通过 LangGraph Router 分发
    """
    # 初始化服务
    session_service = ChatSessionService(session)
    stream_service = StreamService(session)
    
    # 1. 获取或创建线程
    thread = await session_service.get_or_create_thread(
        thread_id=request.conversation_id,
        user_id=current_user.id,
        agent_id=request.agent_id,
        message=request.message
    )
    thread_id = thread.id
    
    # 2. 保存用户消息
    await session_service.save_user_message(thread_id, request.message)
    
    # 3. 构建 LangChain 消息列表
    langchain_messages = await session_service.build_langchain_messages(thread_id)
    
    # 4. 获取自定义智能体（如果有）
    custom_agent = await session_service.get_custom_agent(
        agent_id=request.agent_id or "assistant",
        user_id=current_user.id
    )
    
    # 5. 路由到对应的处理逻辑
    if custom_agent:
        # 自定义智能体模式
        if request.stream:
            return await stream_service.handle_custom_agent_stream(
                custom_agent=custom_agent,
                messages=langchain_messages,
                thread_id=thread_id,
                thread=thread,
                message_id=request.message_id
            )
        else:
            return await stream_service.handle_custom_agent_sync(
                custom_agent=custom_agent,
                messages=langchain_messages,
                thread_id=thread_id,
                thread=thread,
                message_id=request.message_id
            )
    
    # 系统默认助手模式：通过 LangGraph 处理
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
        "user_id": thread.user_id
    }
    
    if request.stream:
        return await stream_service.handle_langgraph_stream(
            initial_state=initial_state,
            thread_id=thread_id,
            thread=thread,
            user_message=request.message,
            message_id=request.message_id
        )
    else:
        return await stream_service.handle_langgraph_sync(
            initial_state=initial_state,
            thread_id=thread_id,
            thread=thread,
            user_message=request.message
        )


# ============================================================================
# HITL (Human-in-the-Loop) 恢复接口
# ============================================================================

@router.post("/chat/resume")
async def resume_chat(
    request: ResumeRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """
    恢复被中断的 HITL 流程
    
    当用户在前端审核计划后，调用此接口继续执行。
    返回 SSE 流，包含后续所有任务执行事件。
    """
    service = RecoveryService(session)
    return await service.resume_chat(
        thread_id=request.thread_id,
        user_id=current_user.id,
        approved=request.approved,
        updated_plan=request.updated_plan,
        message_id=request.message_id
    )


# ============================================================================
# Artifact API
# ============================================================================

@router.get("/artifacts/{artifact_id}")
async def get_artifact_endpoint(
    artifact_id: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """获取单个 Artifact（调试用，返回内容摘要）"""
    service = ArtifactService(session)
    return await service.get_artifact_detail(
        artifact_id=artifact_id,
        user_id=current_user.id,
        include_content=False  # 返回摘要
    )


@router.patch("/artifacts/{artifact_id}", response_model=ArtifactUpdateResponse)
async def update_artifact(
    artifact_id: str,
    request: ArtifactUpdateRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """
    更新 Artifact 内容（用于用户编辑 AI 生成的产物）
    
    此端点实现 Artifact 编辑的持久化，确保用户修改后的内容：
    1. 保存到数据库
    2. 后续任务执行时读取的是修改后的版本
    3. 页面刷新后修改不会丢失
    """
    service = ArtifactService(session)
    result = await service.update_artifact(
        artifact_id=artifact_id,
        content=request.content,
        user_id=current_user.id
    )
    return ArtifactUpdateResponse(**result)
