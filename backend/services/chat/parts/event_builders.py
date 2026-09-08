"""SSE 事件构建 + 运行状态助手机（Mixin）。

自 StreamService 拆出。组合两类助手：
1. SSE 构建：staticmethod 直连 utils/sse_builder（单一对象管线的便捷层），
   别名保持 self._build_* 调用点 API 不变——此前是 6 个纯转发方法体。
2. 运行状态守卫：心跳刷新、取消/超时检查、节点进度同步（触 self.db）。
"""

from __future__ import annotations

from typing import Any

from models import AgentRun
from utils.error_codes import ErrorCode
from utils.sse_builder import (
    build_error_event,
    build_heartbeat_event,
    build_human_interrupt_event,
    build_message_delta_event,
    build_message_done_event,
    build_message_thinking_event,
)
from utils.time import utc_now_naive


class EventBuildersMixin:
    """SSE 事件构建与运行状态助手机。"""

    # SSE 构建：直连 sse_builder（无状态、无 self 访问）
    _build_message_delta_event = staticmethod(build_message_delta_event)
    _build_message_thinking_event = staticmethod(build_message_thinking_event)
    _build_message_done_event = staticmethod(build_message_done_event)
    _build_heartbeat_event = staticmethod(build_heartbeat_event)
    _build_error_event = staticmethod(build_error_event)
    _build_human_interrupt_event = staticmethod(build_human_interrupt_event)

    def _touch_agent_run(self, run_id: str, *, current_node: str | None = None) -> None:
        """轻量刷新运行心跳，可选同步当前节点。"""
        from crud.agent_run import touch_run_heartbeat_by_id

        updated = touch_run_heartbeat_by_id(self.db, run_id, current_node=current_node)
        if updated is not None:
            self.db.commit()

    def _raise_if_run_cancelled(self, run_id: str) -> None:
        """在流式执行中协作检查运行是否已被取消或已超出截止时间。"""
        from crud.agent_run import mark_run_timed_out_by_id
        from models.enums import RunStatus
        from utils.exceptions import AppError

        agent_run = self.db.get(AgentRun, run_id)
        if agent_run is None:
            return

        if agent_run.deadline_at and agent_run.deadline_at <= utc_now_naive():
            timed_out = mark_run_timed_out_by_id(
                self.db,
                run_id,
                error_message="运行超过 deadline，已自动终止",
                current_node=agent_run.current_node,
            )
            if timed_out is not None:
                self.db.commit()
            raise AppError(
                message="运行已超时",
                code=ErrorCode.RUN_TIMED_OUT,
                status_code=409,
                details={"run_id": run_id},
            )

        if agent_run.status == RunStatus.CANCELLED:
            raise AppError(
                message="运行已取消",
                code=ErrorCode.RUN_CANCELLED,
                status_code=409,
                details={"run_id": run_id},
            )

    def _sync_run_progress_from_token(self, token: dict[str, Any], run_id: str) -> None:
        """从 LangGraph token 中提取当前节点，并刷新运行心跳。"""
        event_type = token.get("event", "")
        if event_type != "on_chain_start":
            return

        metadata = token.get("metadata", {}) or {}
        node_name = metadata.get("name") or token.get("name")
        if not node_name:
            return

        self._touch_agent_run(run_id, current_node=str(node_name))
