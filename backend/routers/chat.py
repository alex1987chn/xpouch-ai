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

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
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
    ThreadDetailResponse,
    User,
)
from models.enums import RunStatus
from schemas.common import RevokedResponse
from schemas.task import PaginatedArtifactListResponse
from services.chat.artifact_service import ArtifactService
from services.chat.frame_replay import load_gap_frames, load_replay_frames
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


class DocumentInput(BaseModel):
    """附件文档（轻量版：解析为文本注入上下文，不做持久化）"""

    name: str = Field(..., max_length=200, description="文件名（含扩展名）")
    content_base64: str = Field(..., description="文件内容 base64")


class ChatRequest(BaseModel):
    """聊天请求"""

    message: str = Field(..., max_length=10000, description="用户输入消息，最大10000字符")
    images: list[str] = Field(
        default_factory=list,
        max_length=4,
        description="当前轮图片输入（data:image/*;base64 dataURL），最多 4 张，仅视觉模型可用",
    )
    documents: list[DocumentInput] = Field(
        default_factory=list,
        max_length=3,
        description="附件文档（base64），后端解析为文本注入当前对话上下文",
    )
    history: list[ChatMessageDTO]
    thread_id: str | None = None
    agent_id: str | None = "assistant"
    stream: bool | None = True
    message_id: str | None = None


def _parse_documents(documents: list[DocumentInput]) -> list[dict]:
    """解析附件文档（任一失败即 400）。

    返回 [{"name", "text"}]——文本存消息 extra_data（不进展示内容），
    LLM 上下文注入由 build_langchain_messages 统一处理。
    """
    if not documents:
        return []
    from services.document_parser import DocumentParseError, parse_document

    parsed: list[dict] = []
    for doc in documents:
        try:
            text = parse_document(filename=doc.name, content_base64=doc.content_base64)
        except DocumentParseError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from None
        parsed.append({"name": doc.name, "text": text})
    return parsed


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
    # 显式动作：approve（批准执行）/ revise（驳回+反馈 → 专家修订 v(n+1)）/
    # terminate（终止任务）。缺省按 approved 推导，保持旧客户端兼容。
    action: str | None = Field(default=None, pattern="^(approve|revise|terminate)$")
    feedback: str | None = Field(default=None, max_length=4000)  # 驳回反馈（落库为 user 消息）
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


class DeleteThreadResponse(BaseModel):
    """删除单个线程响应"""

    ok: bool


class ChatResumeResponse(BaseModel):
    """HITL 恢复的非流式分支（approve 分支返回 SSE 流，不经本模型校验）。

    terminate → {status, message}；revise → {status, execution_plan_id, message}。
    """

    status: str
    message: str | None = None
    execution_plan_id: str | None = None


class ArtifactDetailResponse(BaseModel):
    """Artifact 详情（full=false 时 content 为 100 字摘要 + "..."，键不变）"""

    id: str
    thread_id: str | None = None
    type: str
    title: str | None = None
    content: str
    language: str | None = None
    sort_order: int
    sub_task_id: str
    content_length: int
    created_at: str | None = None


class ArtifactShareResponse(BaseModel):
    """产物分享链接创建响应（明文 token 仅此一次返回）"""

    token: str
    path: str
    artifact_id: str
    created_at: str | None = None


@router.delete("/threads/{thread_id}", response_model=DeleteThreadResponse)
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

    # 1.5 附件文档解析（任一失败即 400，不产生半截消息）
    parsed_documents = _parse_documents(request.documents)

    ensure_no_active_run_for_thread(
        session,
        thread_id=thread_id,
        user_id=current_user.id,
    )

    # 2. 保存用户消息——展示内容保持简短，附件以元数据进 extra_data：
    #    文档存解析文本（供 LLM 上下文重建），图片只记数量（本体不落库，防存储膨胀）
    extra_data: dict = {}
    if parsed_documents:
        extra_data["documents"] = parsed_documents
    if request.images:
        extra_data["image_count"] = len(request.images)
    await thread_service.save_user_message(
        thread_id, request.message, extra_data=extra_data or None
    )

    # 3. 构建 LangChain 消息列表
    langchain_messages = await thread_service.build_langchain_messages(thread_id)

    agent_run = create_agent_run(
        session,
        thread_id=thread_id,
        user_id=current_user.id,
        entrypoint="chat",
        mode=None,
        checkpoint_namespace=thread_id,
    )
    session.commit()
    session.refresh(agent_run)

    # 4. 路由到对应的处理逻辑（统一走主链路：router 判断简单/复杂）
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

    # 消息 ID 贯通：请求侧 message_id 供简单模式（direct_reply 流式与落库）；
    # 复杂模式的聚合消息 id 在 run 创建时独立生成（state.aggregate_message_id，
    # 与本轮开头的思考载体消息分离——聚合正文必须排在所有专家消息之后）
    actual_message_id = request.message_id or str(uuid4())
    aggregate_message_id = str(uuid4())

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
        "strategy": "",
        "expert_results": [],
        "final_response": "",
        "context": {},
        "router_decision": "",
        "thread_id": thread_id,
        "run_id": agent_run.id,
        "user_id": thread.user_id,
        "aggregate_message_id": aggregate_message_id,
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
            message_id=actual_message_id,
        )


# ============================================================================
# HITL (Human-in-the-Loop) 恢复接口
# ============================================================================


@router.post("/chat/resume", response_model=ChatResumeResponse)
async def resume_chat(
    request: ResumeRequest,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    恢复被中断的 HITL 流程

    当用户在前端审核计划后，调用此接口继续执行。
    返回 SSE 流，包含后续所有任务执行事件。

    action='revise'（驳回+反馈）返回 {"status": "revising"}，
    修订由后台任务执行，前端轮询 GET /runs/{run_id}/plan 感知 v(n+1)。
    """
    service = RecoveryService(session)
    result = await service.resume_chat(
        thread_id=request.thread_id,
        run_id=request.run_id,
        user_id=current_user.id,
        approved=request.approved,
        updated_plan=request.updated_plan,
        plan_version=request.plan_version,
        idempotency_key=request.idempotency_key,
        feedback=request.feedback,
        action=request.action,
    )
    # 修订：LLM 调用可能持续分钟级，放后台任务执行（响应立即返回）
    if isinstance(result, dict) and result.get("status") == "revising":
        background_tasks.add_task(
            service.run_revision_job,
            run_id=request.run_id,
            thread_id=request.thread_id,
            execution_plan_id=result["execution_plan_id"],
            feedback=(request.feedback or "").strip(),
        )
    return result


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
    search: str | None = Query(None, max_length=100),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """按用户跨会话列出产物（产物中心；列表带内容预览，详情按需另取）"""
    service = ArtifactService(session)
    return await service.list_artifacts(
        user_id=current_user.id,
        thread_id=thread_id,
        artifact_type=artifact_type,
        search=(search or "").strip() or None,
        page=page,
        limit=limit,
    )


@router.get("/artifacts/{artifact_id}", response_model=ArtifactDetailResponse)
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


@router.post("/artifacts/{artifact_id}/share", response_model=ArtifactShareResponse)
async def create_artifact_share(
    artifact_id: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """创建产物分享链接（返回明文 token 一次；每次调用生成新链接）"""
    service = ShareService(session)
    return await asyncio.to_thread(service.create_share, artifact_id, current_user.id)


@router.delete("/artifacts/{artifact_id}/share", response_model=RevokedResponse)
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

    - run 已终态 / run 还在跑但没有可跟随的实时通道：410。前端收到 410 后退化到
      "后台跑完 + 轮询刷新"路径（`useChatCore` 的中断分支保留 runId 并启动
      `useRunPolling`，轮询到终态自动刷新本会话，用户不必手动刷新页面）。
    - run **停在审批点**且本轮流已收尾：整段重放库里这一轮的帧并以 [DONE] 收尾
      （见下方 `_paused_replay_gen`）。这是「断连时错过 human.interrupt → 审批卡
      自己回来」的那条路。
    - 正常返回 SSE：先补放「内存窗口以外」的缺口，再补内存窗口内的 backlog，
      然后跟随实时事件直到 producer 收尾

    为什么要先从库里补一段：内存缓冲每 run 只留最近 MAX_EVENTS_PER_RUN 条，
    断线久了的客户端会落在窗口之前——直接跟随会**静默丢掉中间一段**（不报错，
    只是文字少半截）。已落库的帧覆盖这段，见 services/chat/frame_replay.py。
    """
    # 归属校验统一走共享助手（此前 404 混用：不存在与无权都报 404，
    # 与全站 NotFoundError/AuthorizationError 两段模型不一致）
    from services.chat.thread_service import get_thread_or_raise

    get_thread_or_raise(session, thread_id, current_user.id)

    run = session.exec(
        select(AgentRun).where(AgentRun.thread_id == thread_id).order_by(AgentRun.started_at.desc())
    ).first()
    if not run or run.status in _RUN_TERMINAL_STATUSES:
        raise HTTPException(status_code=410, detail="执行已结束，请刷新会话查看结果")

    subscription = get_stream_hub().subscribe(run.id, last_event_id)
    live_channel = subscription is not None and not subscription[2]
    if not live_channel:
        # 没有可跟随的实时通道（缓冲不存在=进程重启过，或已关闭=这一轮流收尾了）。
        # 若 run 正当停在审批点，这一轮本就是**正常收尾**的，于是把库里这段帧整段
        # 重放并以 [DONE] 收尾：客户端断连期间错过的 `human.interrupt` 由此补回，
        # **审批卡自己回来了**（否则用户看到「等待裁决」却无处可点）。
        # 其他情况（run 还在跑却没通道 / 已终态）仍返回 410，交给前端轮询/刷新。
        if run.status != RunStatus.WAITING_FOR_APPROVAL:
            detail = (
                "执行流缓冲不可用，请稍后刷新查看结果"
                if subscription is None
                else "执行已结束，请刷新会话查看结果"
            )
            raise HTTPException(status_code=410, detail=detail)

        replay = await asyncio.to_thread(load_replay_frames, session, run.id, last_event_id)

        async def _paused_replay_gen():
            for wire in replay:
                yield wire
            # 这一轮流已正常收尾：补上它原本就会发的完成标记，前端据此干净结算
            yield "data: [DONE]\n\n"

        return StreamingResponse(
            _paused_replay_gen(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    backlog, queue, _closed = subscription

    # 缺口补放（无缺口时不查库）：内存窗口最早一条的 seq 与客户端的位置之间
    prefix = await asyncio.to_thread(
        load_gap_frames,
        session,
        run.id,
        last_event_id,
        backlog[0][0] if backlog else None,
    )

    async def _resume_gen():
        try:
            for wire in prefix:
                yield wire
            for _seq, wire in backlog:
                yield wire
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
