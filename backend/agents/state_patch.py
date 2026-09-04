"""图状态更新工具。

统一管理常见状态更新动作，避免各节点重复手写列表拼接/原地修改逻辑。

历史注记：v1 的 event_queue 追加工具（append_sse_event 等）已随事件协议 v2
（emit_event / custom stream）于 2026-09-04 移除，仅保留任务列表工具。
"""

from __future__ import annotations

from typing import Any


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
