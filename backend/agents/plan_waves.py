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

任务在本模块里的三种「未完成」归类（每轮三选一，无遗漏）：
- `ready`    = pending 且依赖**全部满足** → 本轮可执行
- `blocked`  = 依赖里有一个**已失败/已取消**（含传递：上游被阻塞则下游也阻塞）
  → 永远不会就绪。必须显式识别，否则执行器会认为「还有未完成任务」而空转到超时
- `deadlocked` = 既不就绪也不阻塞，即依赖成环（LLM 规划出 A→B→A 这类）
  → 同样永远不会就绪。若不识别，执行器空转；若静默忽略，用户看到的是
  「计划莫名少跑了几个任务」而没有任何解释。故单独成一类，由调用方如实上报。

**依赖悬空（dep 指向计划里不存在的 key）= 视为已满足**，不是阻塞。这是有意的：
计划编辑（`_apply_updated_plan`）允许删除任务而留下悬空依赖，执行侧对这类引用
的既有语义是「忽略该引用、尽力完成」（见 generic 的容错提示词），本模块与之对齐，
避免把「删掉了一个上游」变成「整条下游链全部卡死」。
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

# 任务状态中表示「已终结」的取值（与 models.enums.GraphTaskStatus 对齐，
# 另含 DB TaskStatus 的 cancelled —— to_task_status 映射后可能出现）
_COMPLETED = "completed"
_FAILED = "failed"
_CANCELLED = "cancelled"
_PENDING = "pending"
_TERMINAL_FAILURE = frozenset({_FAILED, _CANCELLED})


def _task_key(task: dict[str, Any]) -> str:
    """任务的依赖空间标识：优先 commander id（`task_id`），退回 db id。

    依赖解析必须用 `task_id`——`depends_on` 里存的是它。
    """
    return str(task.get("task_id") or task.get("id") or "")


def _deps_of(task: dict[str, Any]) -> list[str]:
    deps = task.get("depends_on") or []
    return [str(d) for d in deps]


def _status_by_key(task_list: list[dict[str, Any]]) -> dict[str, str]:
    """key → status（缺 status 视为 pending）。空 key 的任务不参与判定。"""
    status: dict[str, str] = {}
    for task in task_list:
        key = _task_key(task)
        if key:
            status[key] = str(task.get("status") or _PENDING)
    return status


def completed_task_ids(task_list: list[dict[str, Any]]) -> set[str]:
    """已完成任务的 key 集合。"""
    return {_task_key(t) for t in task_list if t.get("status") == _COMPLETED}


def failed_task_ids(task_list: list[dict[str, Any]]) -> set[str]:
    """失败/已取消任务的 key 集合。"""
    return {_task_key(t) for t in task_list if t.get("status") in _TERMINAL_FAILURE}


@dataclass(frozen=True)
class WaveDecision:
    """一轮波次判定的完整结果（三分类 + 是否已结束）。

    `ready` 已按 `sort_order` 稳定排序，调用方直接切片即可（见 `select_wave`）。
    """

    ready: list[str]
    blocked: list[str]
    deadlocked: list[str]

    @property
    def finished(self) -> bool:
        """计划是否已无可执行任务。

        归类是完备的（pending 必属 ready/blocked/deadlocked 之一），所以
        「没有 ready」就等于「永远不会有 ready」——不会出现空转。
        """
        return not self.ready


def _propagate_blocked(
    status_by_key: dict[str, str], deps_by_key: dict[str, list[str]]
) -> set[str]:
    """阻塞的传递闭包：上游失败/取消 → 下游阻塞 → 更下游也阻塞。

    不动点迭代（任务数 ≤ 几十，O(n²) 完全够用）。此前只判「直接依赖失败」，
    更下游要等执行器把直接下游标成 failed 才在下一轮变阻塞——同一轮里
    会留下「既不就绪也不阻塞」的假等待态，正是死循环判定的空隙。
    """
    blocked: set[str] = set()
    changed = True
    while changed:
        changed = False
        for key, status in status_by_key.items():
            if status != _PENDING or key in blocked:
                continue
            for dep in deps_by_key.get(key, ()):
                if dep in blocked or status_by_key.get(dep) in _TERMINAL_FAILURE:
                    blocked.add(key)
                    changed = True
                    break
    return blocked


def plan_wave_decision(task_list: list[dict[str, Any]]) -> WaveDecision:
    """把计划切成 ready / blocked / deadlocked 三类的完整判定。"""
    status_by_key = _status_by_key(task_list)
    known_keys = set(status_by_key)
    deps_by_key = {_task_key(t): _deps_of(t) for t in task_list if _task_key(t)}

    blocked = _propagate_blocked(status_by_key, deps_by_key)

    ready_pairs: list[tuple[int, str]] = []
    pending_pairs: list[tuple[int, str]] = []
    for idx, task in enumerate(task_list):
        key = _task_key(task)
        if not key or status_by_key.get(key) != _PENDING:
            continue
        sort_order = task.get("sort_order")
        order = idx if sort_order is None else int(sort_order)
        pending_pairs.append((order, key))
        if key in blocked:
            continue
        # 悬空依赖（不在计划里）按「已满足」处理，见模块 docstring
        if all(
            status_by_key.get(dep) == _COMPLETED or dep not in known_keys
            for dep in deps_by_key.get(key, ())
        ):
            ready_pairs.append((order, key))

    ready_pairs.sort(key=lambda pair: pair[0])
    pending_pairs.sort(key=lambda pair: pair[0])
    ready = [key for _order, key in ready_pairs]
    ready_set = set(ready)

    # 三分类完备：pending 里剩下的既不就绪也不阻塞 —— 依赖成环（或困在环的下游）。
    # 这里**必须**吃掉全部剩余的 pending，否则执行器会「还有 pending」而空转。
    blocked_ordered = [key for _order, key in pending_pairs if key in blocked]
    deadlocked = [
        key for _order, key in pending_pairs if key not in ready_set and key not in blocked
    ]

    return WaveDecision(ready=ready, blocked=blocked_ordered, deadlocked=deadlocked)


def ready_task_ids(task_list: list[dict[str, Any]]) -> list[str]:
    """按 `sort_order` 返回「已就绪」的任务 key 列表。

    就绪 = pending 且所有依赖都已完成（悬空依赖容忍，见模块 docstring）。
    """
    return plan_wave_decision(task_list).ready


def blocked_task_ids(task_list: list[dict[str, Any]]) -> list[str]:
    """返回因上游失败/取消而**永远不会就绪**的 pending 任务 key（含传递）。"""
    return plan_wave_decision(task_list).blocked


def deadlocked_task_ids(task_list: list[dict[str, Any]]) -> list[str]:
    """返回依赖成环、永远不会就绪的 pending 任务 key。"""
    return plan_wave_decision(task_list).deadlocked


def select_wave(task_list: list[dict[str, Any]], max_concurrency: int) -> list[str]:
    """从就绪任务中取出本轮要执行的一批（上限 `max_concurrency`）。

    `max_concurrency <= 1` 时退化为「一次一个」，与串行行为完全一致
    （默认配置即如此，保证不改变现有业务）。
    """
    ready = plan_wave_decision(task_list).ready
    if max_concurrency <= 1:
        return ready[:1]
    return ready[:max_concurrency]


def is_plan_finished(task_list: list[dict[str, Any]]) -> bool:
    """计划是否已无可执行任务（没有 pending，或 pending 全部就绪不了）。"""
    return plan_wave_decision(task_list).finished
