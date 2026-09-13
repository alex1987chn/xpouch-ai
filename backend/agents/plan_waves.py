"""执行波次规划：把计划里的任务按依赖关系分成可执行的「波」。

设计要点：
- **纯函数，无 IO**：输入是图状态里的 `task_list`，输出是任务 id 列表。
  这样并行执行器、前端分层展示、审批校验都能复用同一套判定。
- **依赖用 commander 语义 id（`task_id`，如 "task_1"）解析，不是 db uuid（`id`）**。
  两者是「双身份」：`id` 是数据库主键，`depends_on` 里存的是 LLM 规划时给出的
  commander id。混用会导致依赖判定失效（`_apply_updated_plan` 曾因此把依赖
  全部清空，见 stream_service 中该函数的注释）。
- **`execution_mode` 只表达「可以并行」，实际并发上限由配置决定**
  （`GRAPH_MAX_CONCURRENCY`，默认 1 = 串行，能力在位但不改变现有行为）。

波次语义：
- `已就绪` = 状态为 pending 且其所有 `depends_on` 都已完成
- `被阻塞` = 状态为 pending 但某个依赖已 failed/cancelled —— 它永远不会就绪，
  必须显式识别出来，否则执行器会空转到超时（失败策略见调用方）
"""

from __future__ import annotations

from typing import Any

# 任务状态中表示「已终结」的取值（与 models.enums.TaskStatus 对齐）
_COMPLETED = "completed"
_FAILED = "failed"
_CANCELLED = "cancelled"
_TERMINAL_FAILURE = frozenset({_FAILED, _CANCELLED})


def _task_key(task: dict[str, Any]) -> str:
    """任务的依赖空间标识：优先 commander id（`task_id`），退回 db id。

    依赖解析必须用 `task_id`——`depends_on` 里存的是它。
    """
    return str(task.get("task_id") or task.get("id") or "")


def _deps_of(task: dict[str, Any]) -> list[str]:
    deps = task.get("depends_on") or []
    return [str(d) for d in deps]


def completed_task_ids(task_list: list[dict[str, Any]]) -> set[str]:
    """已完成任务的 key 集合。"""
    return {_task_key(t) for t in task_list if t.get("status") == _COMPLETED}


def failed_task_ids(task_list: list[dict[str, Any]]) -> set[str]:
    """失败/已取消任务的 key 集合。"""
    return {_task_key(t) for t in task_list if t.get("status") in _TERMINAL_FAILURE}


def ready_task_ids(task_list: list[dict[str, Any]]) -> list[str]:
    """按 `sort_order` 返回「已就绪」的任务 key 列表。

    就绪 = pending 且所有依赖都已完成。无依赖的任务天然就绪。
    """
    done = completed_task_ids(task_list)
    ready: list[tuple[int, str]] = []
    for idx, task in enumerate(task_list):
        if task.get("status") != "pending":
            continue
        if all(dep in done for dep in _deps_of(task)):
            ready.append((int(task.get("sort_order") or idx), _task_key(task)))
    ready.sort(key=lambda pair: pair[0])
    return [key for _order, key in ready]


def blocked_task_ids(task_list: list[dict[str, Any]]) -> list[str]:
    """返回因上游失败而**永远不会就绪**的 pending 任务 key。

    这些任务不能留在 pending：执行器会认为「还有未完成任务」而空转。
    调用方据失败策略决定把它们标成 failed / cancelled 还是 skipped。
    """
    bad = failed_task_ids(task_list)
    return [
        _task_key(task)
        for task in task_list
        if task.get("status") == "pending" and any(dep in bad for dep in _deps_of(task))
    ]


def select_wave(task_list: list[dict[str, Any]], max_concurrency: int) -> list[str]:
    """从就绪任务中取出本轮要执行的一批（上限 `max_concurrency`）。

    `max_concurrency <= 1` 时退化为「一次一个」，与串行行为完全一致
    （默认配置即如此，保证不改变现有业务）。
    """
    ready = ready_task_ids(task_list)
    if max_concurrency <= 1:
        return ready[:1]
    return ready[:max_concurrency]


def is_plan_finished(task_list: list[dict[str, Any]]) -> bool:
    """计划是否已无可执行任务（没有 pending，或 pending 全部被阻塞）。"""
    if not any(t.get("status") == "pending" for t in task_list):
        return True
    return bool(blocked_task_ids(task_list)) and not ready_task_ids(task_list)
