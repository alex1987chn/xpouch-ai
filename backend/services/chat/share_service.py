"""
Artifact 分享服务（B2 单产物分享）

职责:
- 创建/撤销分享令牌：明文 token 仅在创建响应返回一次，库中只存
  SHA-256 哈希（utils/secret_hash，与 OTP/token 同一处理）
- 公开访问解析：token -> 未撤销的 artifact
- 公开端点的简单内存限流（单进程语义，MVP 足够；多副本部署时换集中式）

安全:
- token 用 secrets.token_urlsafe(32)（约 43 字符），不可枚举
- 公开页对内容做转义 / markdown 安全渲染（html=False），无 XSS 面
"""

import time
from collections import defaultdict, deque
from datetime import datetime
from secrets import token_urlsafe
from typing import Any

from sqlmodel import Session

from crud.execution_plan import get_artifact
from models import Artifact, ExecutionPlan, ShareToken, SubTask, Thread
from utils.exceptions import AuthorizationError, NotFoundError
from utils.logger import logger
from utils.secret_hash import hash_secret


class ShareRateLimiter:
    """简单滑动窗口限流（每 IP 每分钟 max_calls 次）"""

    def __init__(self, max_calls: int = 30, window_seconds: int = 60):
        self.max_calls = max_calls
        self.window = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._last_prune = time.monotonic()

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        self._maybe_prune(now)
        hits = self._hits[key]
        while hits and now - hits[0] > self.window:
            hits.popleft()
        if len(hits) >= self.max_calls:
            return False
        hits.append(now)
        return True

    def _maybe_prune(self, now: float) -> None:
        # 周期性清理空 IP 桶，防 dict 无界增长
        if now - self._last_prune < 300:
            return
        self._last_prune = now
        for key in [k for k, v in self._hits.items() if not v]:
            self._hits.pop(key, None)


share_rate_limiter = ShareRateLimiter()


class ShareService:
    """分享令牌业务"""

    def __init__(self, db: Session):
        self.db = db

    # ------------------------------------------------------------------
    # 创建 / 撤销
    # ------------------------------------------------------------------

    def create_share(self, artifact_id: str, user_id: str) -> dict[str, Any]:
        """为 artifact 生成新的分享令牌。

        明文 token 只在本响应出现一次；同一 artifact 可存在多个有效分享
        （每次生成新链），撤销按 artifact 全量撤销（见 revoke_shares）。
        """
        artifact = self._get_owned_artifact(artifact_id, user_id)

        token = token_urlsafe(32)
        share = ShareToken(
            artifact_id=artifact.id,
            token_hash=hash_secret(token),
            created_by=user_id,
            created_at=datetime.now(),
        )
        self.db.add(share)
        self.db.commit()
        logger.info(f"[Share] 创建分享: artifact={artifact_id} user={user_id}")

        return {
            "token": token,
            "path": f"/s/{token}",
            "artifact_id": artifact.id,
            "created_at": share.created_at.isoformat() if share.created_at else None,
        }

    def revoke_shares(self, artifact_id: str, user_id: str) -> dict[str, Any]:
        """撤销该 artifact 的全部分享（令牌不可枚举，逐 artifact 全撤销最简单可靠）"""
        self._get_owned_artifact(artifact_id, user_id)

        revoked = 0
        for share in self.db.query(ShareToken).filter_by(artifact_id=artifact_id, revoked_at=None):
            share.revoked_at = datetime.now()
            self.db.add(share)
            revoked += 1
        self.db.commit()
        return {"revoked": revoked}

    # ------------------------------------------------------------------
    # 公开解析
    # ------------------------------------------------------------------

    def resolve(self, token: str) -> Artifact | None:
        """token -> 未撤销的 artifact；无效/已撤销返回 None（不区分原因，防探测）"""
        share = (
            self.db.query(ShareToken)
            .filter_by(token_hash=hash_secret(token), revoked_at=None)
            .first()
        )
        if not share:
            return None
        return get_artifact(self.db, share.artifact_id)

    # ------------------------------------------------------------------
    # 内部
    # ------------------------------------------------------------------

    def _get_owned_artifact(self, artifact_id: str, user_id: str) -> Artifact:
        """加载 artifact 并校验所有权（artifact→subtask→executionplan→thread 链）"""
        artifact = get_artifact(self.db, artifact_id)
        if not artifact:
            raise NotFoundError(f"Artifact not found: {artifact_id}")

        subtask = self.db.get(SubTask, artifact.sub_task_id)
        plan = (
            self.db.get(ExecutionPlan, subtask.execution_plan_id)
            if subtask and subtask.execution_plan_id
            else None
        )
        thread = self.db.get(Thread, plan.thread_id) if plan and plan.thread_id else None
        if not thread or thread.user_id != user_id:
            raise AuthorizationError("无权操作此产物")
        return artifact
