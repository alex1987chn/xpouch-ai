"""
图条件路由逻辑：Router 之后的分支判定 + 工具循环守卫。

与 graph_builder 解耦，便于单测与策略调整。

**任务推进的路由不在这里**：C2 起由 `agents/nodes/wave_scheduler.py` 的
`route_wave` 按依赖波次决定扇出哪些任务（`Send`），执行子图内部的路由在
`agents/expert_worker.py: route_worker`。本模块只留「意图分流」与「工具循环守卫」。
"""

import logging
from typing import Any

from langchain_core.messages import ToolMessage

from agents.state import AgentState

logger = logging.getLogger(__name__)

TOOL_LOOP_WINDOW = 20
TOOL_LOOP_MAX_TOTAL = 12
TOOL_LOOP_MAX_SAME_TOOL_STREAK = 4
TOOL_LOOP_MAX_PING_PONG = 8


def route_router(state: AgentState) -> str:
    """Router 之后的去向：simple -> direct_reply，否则 -> commander"""
    decision = state.get("router_decision", "complex")
    return "direct_reply" if decision == "simple" else "commander"


def should_trip_tool_loop_guard(messages: list[Any]) -> tuple[bool, str]:
    """检测工具调用是否进入可疑循环（总量/同工具连续/ping-pong）。

    调用方是执行子图内的专家节点：判定只看**本任务**的工具往返（分支草稿消息），
    别的任务的工具调用不会算进来。命中后的动作是「本任务不再绑工具、收尾作答」，
    不是结束整轮计划——见 `agents/nodes/generic.py` 与 `agents/expert_worker.py`。

    注意：原「时间窗口」规则已移除——ToolMessage 的时间戳字段在全库
    无任何写入点，该分支恒不触发（死代码）。剩余三条规则均基于消息序。
    """
    recent_messages = messages[-TOOL_LOOP_WINDOW:]
    tool_messages = [
        msg for msg in recent_messages if isinstance(msg, ToolMessage) and getattr(msg, "name", "")
    ]
    tool_names = [getattr(m, "name", "") for m in tool_messages]

    if len(tool_names) >= TOOL_LOOP_MAX_TOTAL:
        return True, f"最近 {TOOL_LOOP_WINDOW} 条内工具调用过多({len(tool_names)})"

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


# 兼容旧引用（graph 曾直接暴露 _should_trip_tool_loop_guard）
_should_trip_tool_loop_guard = should_trip_tool_loop_guard
