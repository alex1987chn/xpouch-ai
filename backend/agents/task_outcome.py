"""任务产出（outcome）：执行分支把结果交回主图的唯一形状。

一个任务跑完（成功或失败）产出一份 outcome。这个形状是**跨模块契约**：
- **写者**：`agents/nodes/generic.py`（分支内，成功/失败两条路径各一处）
- **读者**：
  - `agents/nodes/wave_scheduler.py` 的 join —— 落成 `task_list` 与 `expert_results`
  - `services/chat/stream_service.py` —— 收集结果用于落库 SubTask / Artifact
- **通道**：`task_outcomes`（key = 依赖空间标识，规约见 `agents/state.py`）

为什么分支不直接写 `task_list` / `expert_results`（这是 C2 的核心取舍）：
并发扇出时往无 reducer 的通道写会直接 `InvalidUpdateError`（已实测）；而给
`task_list` 加 reducer 又会破坏「计划编辑整表替换」的语义（编辑后的新行 key 不同，
按 key 合并会变成追加重复项）。产物先落到有 reducer 的 outcome 通道、再由唯一
写者一次性落状态，是两个需求唯一不冲突的形状。

依赖空间的 key 由 `agents/plan_waves.py` 定义（`task_key`）——那里是依赖判定的
权威，本模块只复用，不另立一套。
"""

from __future__ import annotations

from typing import Any

from agents.plan_waves import task_key

# 上游产物注入上下文时的截断上限（**唯一取值处**）。
# 两个使用点必须同源：wave_scheduler 按它裁剪 Send payload，generic 按它裁剪进 prompt。
# 不在 payload 里带整篇上游产物：Send payload 会随 pending writes 进检查点，而真正
# 进 prompt 的只有这么多。
DEPENDENCY_CONTEXT_LIMIT = 2000

# outcome 的键集（测试钉住它，改字段名只影响本模块 + 两个读者）
OUTCOME_KEYS = (
    "task_key",  # 依赖空间标识：commander 语义 id，退回 db uuid
    "db_uuid",  # SubTask.id（落库/关联 Artifact 用）
    "expert_type",
    "description",
    "input_data",
    "sort_order",
    "status",  # 图状态词表（GraphTaskStatus）：completed / failed
    "output",
    "error",
    "duration_ms",
    "started_at",
    "completed_at",
    "artifact",
)


def sort_order_of(task: dict[str, Any], fallback: int = 0) -> int:
    """任务的排序序号（缺省用 fallback）。"""
    order = task.get("sort_order")
    return fallback if order is None else int(order)


def build_task_outcome(
    task: dict[str, Any],
    *,
    status: str,
    output: str,
    error: str | None = None,
    duration_ms: int = 0,
    started_at: str | None = None,
    completed_at: str | None = None,
    artifact: dict[str, Any] | None = None,
    fallback_order: int = 0,
) -> dict[str, Any]:
    """构造一份 outcome（成功与失败共用，字段齐全以免读者做缺键判断）。"""
    db_uuid = task.get("id")
    return {
        "task_key": task_key(task),
        "db_uuid": db_uuid,
        "expert_type": task.get("expert_type", ""),
        "description": task.get("description", ""),
        "input_data": task.get("input_data") or {},
        "sort_order": sort_order_of(task, fallback_order),
        "status": status,
        "output": output,
        "error": error,
        "duration_ms": duration_ms,
        "started_at": started_at,
        "completed_at": completed_at,
        "artifact": artifact,
    }


def ordered_outcomes(outcomes: dict[str, dict[str, Any]] | None) -> list[dict[str, Any]]:
    """按 `sort_order` 排序的产物列表。

    **聚合顺序必须是计划顺序，不是完成顺序**：并发执行时完成顺序每次都不一样，
    让聚合器按完成顺序读结果会让同一份计划的综述每次不同（内容、语气都变）。
    """
    items = list((outcomes or {}).values())
    items.sort(key=lambda outcome: sort_order_of(outcome))
    return items


def outcome_task_patch(outcome: dict[str, Any]) -> dict[str, Any]:
    """产物 → 落回任务项的字段补丁（供 `replace_task_item_by_key` 使用）。

    只写「任务执行的结果字段」，计划本身（描述/依赖/输入）由计划编辑负责。
    """
    return {
        "status": outcome.get("status"),
        "output_result": {"content": outcome.get("output")},
        "started_at": outcome.get("started_at"),
        "completed_at": outcome.get("completed_at"),
    }


def outcome_to_expert_result(outcome: dict[str, Any]) -> dict[str, Any]:
    """产物 → 聚合器消费的专家结果条目。

    键集与历史实现保持一致（`task_id` 是**依赖空间 key**，`db_uuid` 保留用于排查）：
    `agents/nodes/aggregator.py` 与下游依赖注入都按这两个键匹配。
    """
    return {
        "task_id": outcome.get("task_key"),
        "db_uuid": outcome.get("db_uuid"),
        "expert_type": outcome.get("expert_type"),
        "description": outcome.get("description"),
        "output": outcome.get("output"),
        "status": outcome.get("status"),
        "duration_ms": outcome.get("duration_ms"),
        **({"error": outcome["error"]} if outcome.get("error") else {}),
    }
