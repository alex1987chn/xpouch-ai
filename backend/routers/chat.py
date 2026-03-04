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
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlmodel import Session

from database import get_session
from dependencies import get_current_user
from models import (
    MessageResponse,
    PaginatedThreadListResponse,
    ThreadDetailResponse,
    User,
)
from services.chat.artifact_service import ArtifactService
from services.chat.recovery_service import RecoveryService

# 🔥 Service 层导入（backend 是 Python 路径根）
from services.chat.session_service import ChatSessionService
from services.chat.stream_service import StreamService

router = APIRouter(prefix="/api", tags=["chat"])


# ============================================================================
# Pydantic 请求/响应模型
# ============================================================================

class ChatMessageDTO(BaseModel):
    """聊天消息 DTO"""
    role: str
    content: str
    id: str | None = None
    timestamp: str | None = None


class ChatRequest(BaseModel):
    """聊天请求"""
    message: str = Field(..., max_length=10000, description="用户输入消息，最大10000字符")
    history: list[ChatMessageDTO]
    conversation_id: str | None = None
    agent_id: str | None = "assistant"
    stream: bool | None = True
    message_id: str | None = None


class ResumeRequest(BaseModel):
    """HITL 恢复请求"""
    thread_id: str
    updated_plan: list[dict[str, Any]] | None = None
    plan_version: int | None = Field(default=None, ge=1)
    approved: bool = True
    message_id: str | None = None  # 前端传入的消息ID，用于关联流式输出
    idempotency_key: str | None = Field(default=None, min_length=8, max_length=128)


class ArtifactUpdateRequest(BaseModel):
    """Artifact 更新请求"""
    content: str


class ArtifactUpdateResponse(BaseModel):
    """Artifact 更新响应"""
    id: str
    type: str
    title: str | None
    content: str
    language: str | None
    sort_order: int
    updated: bool


# ============================================================================
# 线程管理 API
# ============================================================================

@router.get("/threads", response_model=PaginatedThreadListResponse)
async def get_threads(
    page: int = 1,
    limit: int = 20,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """
    获取当前用户的线程列表（轻量级，支持分页）

    - page: 页码（从1开始）
    - limit: 每页条数（默认20，最大100）
    - 只返回线程元数据，不包含消息内容
    - 需要获取消息请调用 GET /threads/{id}/messages
    """
    service = ChatSessionService(session)
    return await service.list_threads(current_user.id, page=page, limit=limit)


@router.get("/threads/{thread_id}", response_model=ThreadDetailResponse)
async def get_thread(
    thread_id: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """
    获取单个线程详情（包含 TaskSession/SubTasks/Artifacts）

    包含完整的消息列表，适合进入聊天页后加载。
    """
    service = ChatSessionService(session)
    return await service.get_thread_detail(thread_id, current_user.id)


@router.get("/threads/{thread_id}/messages", response_model=list[MessageResponse])
async def get_thread_messages(
    thread_id: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """
    获取指定线程的消息列表（完整内容）

    单独的端点，避免列表接口加载大量消息内容。
    """
    service = ChatSessionService(session)
    return await service.get_thread_messages(thread_id, current_user.id)


class BatchDeleteRequest(BaseModel):
    """批量删除请求"""
    thread_ids: list[str]


class BatchDeleteResponse(BaseModel):
    """批量删除响应"""
    success: bool
    deleted_count: int
    failed_ids: list[str] = []


@router.delete("/threads/{thread_id}")
async def delete_thread(
    thread_id: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """删除单个线程"""
    service = ChatSessionService(session)
    await service.delete_thread(thread_id, current_user.id)
    return {"ok": True}


@router.post("/threads/batch-delete", response_model=BatchDeleteResponse)
async def batch_delete_threads(
    request: BatchDeleteRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """
    批量删除线程

    - 同时删除多个会话
    - 验证所有会话属于当前用户
    - 返回成功删除数量和失败ID列表
    """
    service = ChatSessionService(session)
    deleted_count = 0
    failed_ids = []

    for thread_id in request.thread_ids:
        try:
            await service.delete_thread(thread_id, current_user.id)
            deleted_count += 1
        except Exception:
            failed_ids.append(thread_id)

    return BatchDeleteResponse(
        success=deleted_count > 0,
        deleted_count=deleted_count,
        failed_ids=failed_ids
    )


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
        plan_version=request.plan_version,
        message_id=request.message_id,
        idempotency_key=request.idempotency_key
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
