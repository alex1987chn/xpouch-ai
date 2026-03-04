"""
图条件路由逻辑：Router / Dispatcher / Generic 之后的分支判定。
与 graph_builder 解耦，便于单测与策略调整。
"""
import logging
from datetime import datetime, timedelta
from typing import Any

from langchain_core.messages import ToolMessage

from agents.state import AgentState

logger = logging.getLogger(__name__)

TOOL_LOOP_WINDOW = 20
TOOL_LOOP_MAX_TOTAL = 12
TOOL_LOOP_MAX_SAME_TOOL_STREAK = 4
TOOL_LOOP_MAX_PING_PONG = 8
TOOL_LOOP_TIME_WINDOW_SECONDS = 30
TOOL_LOOP_MAX_IN_TIME_WINDOW = 8


def route_router(state: AgentState) -> str:
    """Router 之后的去向：simple -> direct_reply，否则 -> commander"""
    decision = state.get("router_decision", "complex")
    return "direct_reply" if decision == "simple" else "commander"


def route_dispatcher(state: AgentState) -> str:
    """Dispatcher 之后：是否还有任务，有则回 expert_dispatcher，无则 aggregator"""
    task_list = state.get("task_list", [])
    current_index = state.get("current_task_index", 0)
    return "aggregator" if current_index >= len(task_list) else "expert_dispatcher"


def route_generic(state: AgentState) -> str:
    """
    Generic Worker 之后：工具调用 -> tools；ToolMessage 回 generic；
    任务完成 -> aggregator；否则回 expert_dispatcher。
    """
    from langchain_core.messages import ToolMessage

    messages = state.get("messages", [])
    current_index = state.get("current_task_index", 0)
    task_list = state.get("task_list", [])

    if not messages:
        return route_dispatcher(state)

    last_message = messages[-1]
    should_break, reason = should_trip_tool_loop_guard(messages)
    if should_break:
        logger.warning("[RouteGeneric] 熔断触发：%s，强制结束任务", reason)
        return "aggregator"

    if hasattr(last_message, "tool_calls") and last_message.tool_calls:
        return "tools"
    if isinstance(last_message, ToolMessage):
        return "generic"
    if current_index >= len(task_list):
        return "aggregator"
    return route_dispatcher(state)


def should_trip_tool_loop_guard(messages: list[Any]) -> tuple[bool, str]:
    """检测工具调用是否进入可疑循环（总量/同工具连续/ping-pong/时间窗口）。"""
    recent_messages = messages[-TOOL_LOOP_WINDOW:]
    tool_messages = [
        msg for msg in recent_messages
        if isinstance(msg, ToolMessage) and getattr(msg, "name", "")
    ]
    tool_names = [getattr(m, "name", "") for m in tool_messages]

    if len(tool_names) >= TOOL_LOOP_MAX_TOTAL:
        return True, f"最近 {TOOL_LOOP_WINDOW} 条内工具调用过多({len(tool_names)})"

    now = datetime.now()
    recent_by_time = 0
    for msg in tool_messages:
        ts = _extract_tool_message_timestamp(msg)
        if ts and now - ts <= timedelta(seconds=TOOL_LOOP_TIME_WINDOW_SECONDS):
            recent_by_time += 1
    if recent_by_time >= TOOL_LOOP_MAX_IN_TIME_WINDOW:
        return True, f"{TOOL_LOOP_TIME_WINDOW_SECONDS}s 内工具调用过多({recent_by_time})"

    if tool_names:
        tail_name = tool_names[-1]
        same_streak = 0
        for name in reversed(tool_names):
            if name == tail_name:
                same_streak += 1
            else:
                break
        if same_streak >= TOOL_LOOP_MAX_SAME_TOOL_STREAK:
            return True, f"工具 {tail_name} 连续调用 {same_streak} 次"

    if len(tool_names) >= TOOL_LOOP_MAX_PING_PONG:
        tail = tool_names[-TOOL_LOOP_MAX_PING_PONG:]
        first, second = tail[0], tail[1]
        if first != second and all(
            name == (first if idx % 2 == 0 else second) for idx, name in enumerate(tail)
        ):
            return True, f"检测到工具 ping-pong 循环({first}<->{second})"

    return False, ""


def _extract_tool_message_timestamp(msg: ToolMessage) -> datetime | None:
    """从 ToolMessage 的 additional_kwargs / response_metadata 提取时间戳。"""
    candidates = []
    additional = getattr(msg, "additional_kwargs", None) or {}
    metadata = getattr(msg, "response_metadata", None) or {}
    for key in ("ts", "timestamp", "created_at"):
        if key in additional:
            candidates.append(additional[key])
        if key in metadata:
            candidates.append(metadata[key])
    for raw in candidates:
        if not raw:
            continue
        if isinstance(raw, datetime):
            return raw
        if isinstance(raw, str):
            try:
                return datetime.fromisoformat(raw.replace("Z", "+00:00"))
            except ValueError:
                continue
    return None


# 兼容旧引用（graph 曾直接暴露 _should_trip_tool_loop_guard）
_should_trip_tool_loop_guard = should_trip_tool_loop_guard
