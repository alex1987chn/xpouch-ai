"""
LangGraph 状态补丁工具。

统一管理常见状态更新动作，避免各节点重复手写列表拼接/原地修改逻辑。
"""

from __future__ import annotations

import os
from typing import Any

EVENT_QUEUE_MAX_SIZE = int(os.getenv("EVENT_QUEUE_MAX_SIZE", "200"))


def _trim_event_queue(event_queue: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """限制 event_queue 长度，避免长对话导致状态无限膨胀。"""
    if len(event_queue) <= EVENT_QUEUE_MAX_SIZE:
        return [*event_queue]
    return [*event_queue[-EVENT_QUEUE_MAX_SIZE:]]


def get_event_queue_snapshot(state: dict[str, Any]) -> list[dict[str, Any]]:
    """返回 event_queue 的快照副本。"""
    return _trim_event_queue([*state.get("event_queue", [])])


def append_event(
    event_queue: list[dict[str, Any]],
    event_entry: dict[str, Any],
) -> list[dict[str, Any]]:
    """不可变追加一个事件。"""
    return _trim_event_queue([*event_queue, event_entry])


def append_sse_event(event_queue: list[dict[str, Any]], event: str) -> list[dict[str, Any]]:
    """不可变追加一个 SSE 字符串事件。"""
    return append_event(event_queue, {"type": "sse", "event": event})


def append_sse_events(event_queue: list[dict[str, Any]], events: list[str]) -> list[dict[str, Any]]:
    """不可变追加多个 SSE 字符串事件。"""
    if not events:
        return _trim_event_queue([*event_queue])
    return _trim_event_queue([*event_queue, *({"type": "sse", "event": event} for event in events)])


def replace_task_item(
    task_list: list[dict[str, Any]],
    index: int,
    patch: dict[str, Any],
) -> list[dict[str, Any]]:
    """返回替换指定任务后的新 task_list。"""
    if index < 0 or index >= len(task_list):
        raise IndexError(f"Task index out of range: {index}")

    updated_task = {
        **task_list[index],
        **patch,
    }
    return [*task_list[:index], updated_task, *task_list[index + 1 :]]
