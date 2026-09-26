"""聊天域请求 DTO。

T2 请求侧契约锚点（2026-09-27）：请求模型与响应模型同住 schemas/，
类名即 OpenAPI schema 名——frontend/src/types/api.generated.ts 的请求
形状由本文件生成，前端 services 层 payload 以生成物为类型（改字段 =
前端编译错，而非运行时 422）。
"""

from typing import Any

from pydantic import BaseModel, Field


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


class BatchDeleteRequest(BaseModel):
    """批量删除请求"""

    thread_ids: list[str]
