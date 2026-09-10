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
- ChatThreadService: 线程生命周期管理
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

import asyncio
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from crud.agent_run import create_agent_run, ensure_no_active_run_for_thread
from database import get_session
from dependencies import get_current_user
from models import (
    AgentRun,
    MessageResponse,
    PaginatedThreadListResponse,
    Thread,
    ThreadDetailResponse,
    User,
)
from models.enums import RunStatus
from schemas.task import PaginatedArtifactListResponse
from services.chat.artifact_service import ArtifactService
from services.chat.recovery_service import RecoveryService
from services.chat.share_service import ShareService
from services.chat.stream_hub import get_stream_hub
from services.chat.stream_service import StreamService

# 🔥 Service 层导入（backend 是 Python 路径根）
from services.chat.thread_service import ChatThreadService
from utils.logger import logger

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
    images: list[str] = Field(
        default_factory=list,
        max_length=4,
        description="当前轮图片输入（data:image/*;base64 dataURL），最多 4 张，仅视觉模型可用",
    )
    history: list[ChatMessageDTO]
    thread_id: str | None = None
    agent_id: str | None = "assistant"
    stream: bool | None = True
    message_id: str | None = None


def _attach_images(
    langchain_messages: list,
    images: list[str],
    model_id: str,
) -> None:
    """把当前轮图片以 OpenAI 多部件 content 附加到最后一条 HumanMessage。

    仅当目标模型声明 vision 能力时生效；不支持则显式 400（前端会禁用入口）。
    v1 图片只作用于当前轮，不入历史重建。
    """
    if not images:
        return
    from langchain_core.messages import HumanMessage

    from providers_config import get_model_config

    config = get_model_config(model_id) or {}
    if not config.get("vision"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"当前模型不支持图片输入: {model_id}",
        )
    last = langchain_messages[-1]
    text = last.text_content() if hasattr(last, "text_content") else str(last.content)
    parts: list[dict] = [{"type": "text", "text": text}]
    parts += [{"type": "image_url", "image_url": {"url": img}} for img in images]
    langchain_messages[-1] = HumanMessage(content=parts)


class ResumeRequest(BaseModel):
    """HITL 恢复请求"""

    thread_id: str
    run_id: str
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
    current_user: User = Depends(get_current_user),
):
    """
    获取当前用户的线程列表（轻量级，支持分页）

    - page: 页码（从1开始）
    - limit: 每页条数（默认20，最大100）
    - 只返回线程元数据，不包含消息内容
    - 需要获取消息请调用 GET /threads/{id}/messages
    """
    service = ChatThreadService(session)
    return await service.list_threads(current_user.id, page=page, limit=limit)


@router.get("/threads/{thread_id}", response_model=ThreadDetailResponse)
async def get_thread(
    thread_id: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    获取单个线程详情（包含 ExecutionPlan/SubTasks/Artifacts）

    包含完整的消息列表，适合进入聊天页后加载。
    """
    service = ChatThreadService(session)
    return await service.get_thread_detail(thread_id, current_user.id)


@router.get("/threads/{thread_id}/messages", response_model=list[MessageResponse])
async def get_thread_messages(
    thread_id: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    获取指定线程的消息列表（完整内容）

    单独的端点，避免列表接口加载大量消息内容。
    """
    service = ChatThreadService(session)
    return await service.get_thread_messages(thread_id, current_user.id)


class BatchDeleteRequest(BaseModel):
    """批量删除请求"""

    thread_ids: list[str]


class BatchDeleteResponse(BaseModel):
    """批量删除响应"""

    success: bool
    deleted_count: int
    failed_ids: list[str] = []


class CancelRunResponse(BaseModel):
    """取消运行响应"""

    status: str
    message: str


@router.delete("/threads/{thread_id}")
async def delete_thread(
    thread_id: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """删除单个线程"""
    service = ChatThreadService(session)
    await service.delete_thread(thread_id, current_user.id)
    return {"ok": True}


@router.post("/threads/batch-delete", response_model=BatchDeleteResponse)
async def batch_delete_threads(
    request: BatchDeleteRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    批量删除线程

    - 同时删除多个会话
    - 验证所有会话属于当前用户
    - 返回成功删除数量和失败ID列表
    """
    service = ChatThreadService(session)
    deleted_count = 0
    failed_ids = []

    for thread_id in request.thread_ids:
        try:
            await service.delete_thread(thread_id, current_user.id)
            deleted_count += 1
        except Exception as e:
            logger.warning(
                "[Chat] 批量删除会话失败: thread=%s user=%s err=%s", thread_id, current_user.id, e
            )
            failed_ids.append(thread_id)

    return BatchDeleteResponse(
        success=deleted_count > 0, deleted_count=deleted_count, failed_ids=failed_ids
    )


# ============================================================================
# 主要聊天端点
# ============================================================================


@router.post("/chat")
async def chat_endpoint(
    request: ChatRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    统一聊天端点（简单模式 + 复杂模式）

    - 自定义智能体：直接流式调用
    - 系统默认助手：通过 LangGraph Router 分发
    """
    # 0. 用户日 token 配额（管理员配置的全局上限；HITL 恢复走 /chat/resume 不在此拦截）
    from services.run_quota import (
        load_daily_token_quota,
        quota_reset_hint,
        today_token_usage_exceeds_quota,
    )

    daily_quota = load_daily_token_quota(session)
    if daily_quota and today_token_usage_exceeds_quota(session, current_user.id, daily_quota):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"今日 token 用量已达配额上限（{daily_quota}），将于 {quota_reset_hint()} 重置",
        )

    # 初始化服务
    thread_service = ChatThreadService(session)
    stream_service = StreamService(session)

    # 1. 获取或创建线程
    thread = await thread_service.get_or_create_thread(
        thread_id=request.thread_id,
        user_id=current_user.id,
        agent_id=request.agent_id,
        message=request.message,
    )
    thread_id = thread.id

    ensure_no_active_run_for_thread(
        session,
        thread_id=thread_id,
        user_id=current_user.id,
    )

    # 2. 保存用户消息
    await thread_service.save_user_message(thread_id, request.message)

    # 3. 构建 LangChain 消息列表
    langchain_messages = await thread_service.build_langchain_messages(thread_id)

    # 4. 获取自定义智能体（如果有）
    custom_agent = await thread_service.get_custom_agent(
        agent_id=request.agent_id or "assistant", user_id=current_user.id
    )

    if custom_agent is not None:
        _attach_images(
            langchain_messages,
            request.images,
            custom_agent.model_id or "deepseek-flash",
        )

    agent_run = create_agent_run(
        session,
        thread_id=thread_id,
        user_id=current_user.id,
        entrypoint="chat",
        mode="custom" if custom_agent else "router",
        checkpoint_namespace=thread_id,
    )
    session.commit()
    session.refresh(agent_run)

    # 5. 路由到对应的处理逻辑
    if custom_agent:
        # 自定义智能体模式
        if request.stream:
            return await stream_service.handle_custom_agent_stream(
                custom_agent=custom_agent,
                messages=langchain_messages,
                thread_id=thread_id,
                thread=thread,
                agent_run=agent_run,
                message_id=request.message_id,
            )
        else:
            return await stream_service.handle_custom_agent_sync(
                custom_agent=custom_agent,
                messages=langchain_messages,
                thread_id=thread_id,
                thread=thread,
                agent_run=agent_run,
                message_id=request.message_id,
            )

    # 系统默认助手模式：通过 LangGraph 处理
    # 读取全局模型偏好（simple 模式使用；失败静默降级为系统默认）
    try:
        from services.user_preferences import load_model_preferences

        user_preferences = load_model_preferences(session)
    except Exception:
        user_preferences = {"simple_model": None, "simple_thinking": "auto"}

    from utils.llm_factory import get_effective_model

    _attach_images(
        langchain_messages,
        request.images,
        get_effective_model(user_preferences.get("simple_model")),
    )

    # 消息 ID 贯通：state 与 SSE 事件/落库共用同一 ID（aggregator 不再随机 uuid）
    actual_message_id = request.message_id or str(uuid4())

    # Stage 3 跨轮产物连续性：注入本会话最近产物摘要（有界，失败静默跳过）
    try:
        from tools.artifacts import get_recent_artifacts_for_thread

        recent_artifacts = get_recent_artifacts_for_thread(session, thread_id, limit=5)
    except Exception:
        recent_artifacts = []

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
        "run_id": agent_run.id,
        "user_id": thread.user_id,
        "message_id": actual_message_id,
        "recent_artifacts": recent_artifacts,
        "simple_model": user_preferences.get("simple_model"),
        "simple_thinking": user_preferences.get("simple_thinking", "auto"),
    }

    if request.stream:
        return await stream_service.handle_langgraph_stream(
            initial_state=initial_state,
            thread_id=thread_id,
            thread=thread,
            agent_run=agent_run,
            user_message=request.message,
            message_id=actual_message_id,
        )
    else:
        return await stream_service.handle_langgraph_sync(
            initial_state=initial_state,
            thread_id=thread_id,
            thread=thread,
            agent_run=agent_run,
            user_message=request.message,
        )


# ============================================================================
# HITL (Human-in-the-Loop) 恢复接口
# ============================================================================


@router.post("/chat/resume")
async def resume_chat(
    request: ResumeRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    恢复被中断的 HITL 流程

    当用户在前端审核计划后，调用此接口继续执行。
    返回 SSE 流，包含后续所有任务执行事件。
    """
    service = RecoveryService(session)
    return await service.resume_chat(
        thread_id=request.thread_id,
        run_id=request.run_id,
        user_id=current_user.id,
        approved=request.approved,
        updated_plan=request.updated_plan,
        plan_version=request.plan_version,
        message_id=request.message_id,
        idempotency_key=request.idempotency_key,
    )


@router.post("/runs/{run_id}/cancel", response_model=CancelRunResponse)
async def cancel_run(
    run_id: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """显式取消指定运行实例。"""
    service = RecoveryService(session)
    return await service.cancel_run(run_id, current_user.id)


# ============================================================================
# Artifact API
# ============================================================================


@router.get("/artifacts", response_model=PaginatedArtifactListResponse)
async def list_artifacts_endpoint(
    page: int = 1,
    limit: int = 20,
    thread_id: str | None = None,
    artifact_type: str | None = Query(None, alias="type"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """按用户跨会话列出产物（产物中心；列表带内容预览，详情按需另取）"""
    service = ArtifactService(session)
    return await service.list_artifacts(
        user_id=current_user.id,
        thread_id=thread_id,
        artifact_type=artifact_type,
        page=page,
        limit=limit,
    )


@router.get("/artifacts/{artifact_id}")
async def get_artifact_endpoint(
    artifact_id: str,
    full: bool = False,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """获取单个 Artifact（默认返回内容摘要；full=true 返回完整内容）"""
    service = ArtifactService(session)
    return await service.get_artifact_detail(
        artifact_id=artifact_id,
        user_id=current_user.id,
        include_content=full,
    )


@router.patch("/artifacts/{artifact_id}", response_model=ArtifactUpdateResponse)
async def update_artifact(
    artifact_id: str,
    request: ArtifactUpdateRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
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
        artifact_id=artifact_id, content=request.content, user_id=current_user.id
    )
    return ArtifactUpdateResponse(**result)


@router.post("/artifacts/{artifact_id}/share")
async def create_artifact_share(
    artifact_id: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """创建产物分享链接（返回明文 token 一次；每次调用生成新链接）"""
    service = ShareService(session)
    return await asyncio.to_thread(service.create_share, artifact_id, current_user.id)


@router.delete("/artifacts/{artifact_id}/share")
async def revoke_artifact_share(
    artifact_id: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """撤销该产物的全部分享链接"""
    service = ShareService(session)
    return await asyncio.to_thread(service.revoke_shares, artifact_id, current_user.id)


# ============================================================================
# SSE 断线续传（B6）
# ============================================================================

_RUN_TERMINAL_STATUSES = {
    RunStatus.COMPLETED,
    RunStatus.FAILED,
    RunStatus.CANCELLED,
    RunStatus.TIMED_OUT,
}


@router.get("/chat/{thread_id}/stream/resume")
async def resume_stream(
    thread_id: str,
    last_event_id: int = 0,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """从 last_event_id 之后重放并继续推送该 run 的 SSE 事件流。

    - run 已终态 / 缓冲不可用（重启丢缓冲、seq 超出窗口）：410，
      前端退化到"后台跑完 + 轮询刷新"路径
    - 正常返回 SSE：先补放 backlog，再跟随实时事件直到 producer 收尾
    """
    thread = session.get(Thread, thread_id)
    if not thread or thread.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="会话不存在")

    run = session.exec(
        select(AgentRun).where(AgentRun.thread_id == thread_id).order_by(AgentRun.started_at.desc())
    ).first()
    if not run or run.status in _RUN_TERMINAL_STATUSES:
        raise HTTPException(status_code=410, detail="执行已结束，请刷新会话查看结果")

    subscription = get_stream_hub().subscribe(run.id, last_event_id)
    if subscription is None:
        raise HTTPException(status_code=410, detail="执行流缓冲不可用，请稍后刷新查看结果")
    backlog, queue, closed = subscription

    async def _resume_gen():
        try:
            for _seq, wire in backlog:
                yield wire
            if not closed:
                while True:
                    try:
                        item = await asyncio.wait_for(queue.get(), timeout=30)
                    except TimeoutError:
                        # SSE 注释行：保持链路活跃，解析器忽略
                        yield ": keepalive\n\n"
                        continue
                    if item is None:
                        return
                    _seq, wire = item
                    yield wire
        finally:
            get_stream_hub().unsubscribe(run.id, queue)

    return StreamingResponse(
        _resume_gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
