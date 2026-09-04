"""SSE 事件构建 + 运行状态助手机（Mixin）。

自 StreamService 拆出：纯事件构建（无状态）与运行实例状态/心跳交互。
主类以 Mixin 方式组合，保持 self.db 访问语义不变。
实现与 StreamService 原方法逐一对应（拆分搬运，非重写）。
"""

from __future__ import annotations

from datetime import datetime
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


class EventBuildersMixin:
    """SSE 事件构建与运行状态助手机。"""

    def _build_message_delta_event(self, message_id: str, content: str) -> str:
        """构建 message.delta 事件"""
        return build_message_delta_event(message_id=message_id, content=content)

    def _build_message_thinking_event(self, message_id: str, content: str) -> str:
        """构建 message.thinking 事件"""
        return build_message_thinking_event(message_id=message_id, content=content)

    def _build_message_done_event(self, message_id: str, content: str) -> str:
        """构建 message.done 事件"""
        return build_message_done_event(message_id=message_id, content=content)

    def _build_heartbeat_event(self) -> str:
        """构建 heartbeat 事件，供前端更新活跃时间。"""
        return build_heartbeat_event()

    def _build_error_event(self, code: str | ErrorCode, message: str) -> str:
        """构建 error 事件"""
        return build_error_event(code=code, message=message)

    def _build_human_interrupt_event(
        self,
        thread_id: str,
        current_plan: list[dict],
        plan_version: int,
        run_id: str | None = None,
        execution_plan_id: str | None = None,
    ) -> str:
        """构建 human.interrupt 事件 (HITL)"""
        return build_human_interrupt_event(
            thread_id=thread_id,
            current_plan=current_plan,
            plan_version=plan_version,
            run_id=run_id,
            execution_plan_id=execution_plan_id,
        )

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

        if agent_run.deadline_at and agent_run.deadline_at <= datetime.now():
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
