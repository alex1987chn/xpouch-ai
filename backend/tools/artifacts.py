"""历史产物工具：跨轮产物连续性（Stage 3）。

Commander 规划时从 state.recent_artifacts 拿到产物摘要（有界），
专家执行「修改产物」类任务时通过 get_artifact 按需读取完整内容，
避免把全量产物塞进图状态。
"""

from langchain_core.tools import tool
from sqlmodel import Session as SQLModelSession
from sqlmodel import select

from database import engine
from models.domain.artifact import Artifact
from models.domain.subtask import SubTask
from utils.logger import logger

# 单次读取的内容上限（防止超长产物撑爆上下文）
MAX_ARTIFACT_CONTENT_CHARS = 20000


def _load_artifact(artifact_id: str) -> Artifact | None:
    with SQLModelSession(engine) as session:
        return session.get(Artifact, artifact_id)


@tool
def get_artifact(artifact_id: str) -> str:
    """读取本会话中某个历史产物的完整内容（修改/引用既有产物时使用）。

    Args:
        artifact_id: 产物 ID（来自任务描述或规划上下文中标注的产物清单，形如 uuid）

    Returns:
        产物的类型、标题与完整内容（超长截断）
    """
    try:
        artifact = _load_artifact(artifact_id)
    except Exception as e:
        logger.error(f"[Tool:get_artifact] 查询产物失败 id={artifact_id}: {e}")
        return f"❌ 查询产物失败: {e}"

    if artifact is None:
        return (
            f"❌ 未找到产物 {artifact_id}。请确认 ID 来自任务描述中的产物清单；"
            "若清单中没有，说明该产物不存在或已随会话清理。"
        )

    content = artifact.content or ""
    truncated = ""
    if len(content) > MAX_ARTIFACT_CONTENT_CHARS:
        content = content[:MAX_ARTIFACT_CONTENT_CHARS]
        truncated = "\n\n...(内容过长，已截断)..."

    return (
        f"【产物 {artifact.id}】\n"
        f"类型: {artifact.type}\n"
        f"标题: {artifact.title or '(无标题)'}\n"
        f"创建时间: {artifact.created_at.isoformat() if artifact.created_at else '未知'}\n\n"
        f"{content}{truncated}"
    )


def _load_expert_type(sub_task_id: str) -> str | None:
    with SQLModelSession(engine) as session:
        subtask = session.get(SubTask, sub_task_id)
        return subtask.expert_type if subtask else None


def get_recent_artifacts_for_thread(session: SQLModelSession, thread_id: str, limit: int = 5):
    """查询会话最近的历史产物摘要（跨轮连续性注入用）。

    返回按创建时间倒序的有界摘要列表：id / type / title / expert_type / 内容头。
    """
    from models.domain.execution_plan import ExecutionPlan

    stmt = (
        select(Artifact, SubTask.expert_type)
        .join(SubTask, Artifact.sub_task_id == SubTask.id)
        .join(ExecutionPlan, SubTask.execution_plan_id == ExecutionPlan.id)
        .where(ExecutionPlan.thread_id == thread_id)
        .order_by(Artifact.created_at.desc())
        .limit(limit)
    )
    rows = session.exec(stmt).all()

    digests = []
    for artifact, expert_type in rows:
        digests.append(
            {
                "id": artifact.id,
                "type": artifact.type,
                "title": artifact.title,
                "expert_type": expert_type,
                "content_head": (artifact.content or "")[:400],
            }
        )
    return digests
