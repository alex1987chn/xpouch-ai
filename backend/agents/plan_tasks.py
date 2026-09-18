"""计划任务的 canonical 形状与**唯一一处**转换（批次 B4）。

**为什么存在这个模块**：同一份计划此前在四个地方各写一遍、字段名还不一致——
LLM 输出模型（`commander.Task`，依赖叫 `dependencies`）、图状态里的 dict
（依赖叫 `depends_on`）、事件 payload（`TaskInfo`）、落库 DTO（`SubTaskCreate`）。
每一次「名字不一样」都是一次手写映射，而手写映射漏字段是**静默丢数据**
（本仓已经丢过：`input_data` 少列、依赖被清空、`depends_on` 从未随 plan.created 下发）。

现在：canonical 模型只有一份，边界转换只在这个文件里发生，并有测试钉住三条链的字段集
（见 tests/test_plan_task_conversions.py）。改字段名 → 只改这里 + 跑测试。

**两条身份线（不要混淆，它们都是真实存在的）**：
- `id`：**Commander 语义 ID**（如 `task_1`）。LLM 生成、`depends_on` 里引用的就是它，
  也是 `expert_results` 匹配下游依赖时用的键。
- `subtask_id`：**数据库 UUID**。落库后才有（未落库为 None），前端看到的计划任务 id、
  审批卡回传的 `updated_plan[].id` 都是它。

图状态 dict 里这两个键的名字是历史遗留的（`id` 存 UUID、`task_id` 存语义 ID），
**有意不改**：那个形状被 generic / dispatcher / aggregator / plan_waves 广泛读取，
改名属于纯风险无收益。改由 `to_state_dict()` 一处生成并在此写清映射。
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from models.enums import ExecutionMode
from schemas.task import SubTaskCreate
from utils.logger import logger

# 图状态 dict 的键（历史命名，见模块 docstring）——集中在这里，避免各节点各记一套
STATE_KEY_UUID = "id"
STATE_KEY_SEMANTIC = "task_id"


class PlanTask(BaseModel):
    """计划的单个任务（canonical）。

    字段集 = LLM 给出的计划信息 + 落库后拿到的 `subtask_id`；运行时字段
    （output_result / started_at / completed_at）由 `to_state_dict()` 初始化为 None，
    之后由各节点在 dict 上就地更新（保持状态可序列化，不把模型塞进图状态）。
    """

    id: str  # Commander 语义 ID（task_1）
    subtask_id: str | None = None  # 落库后的 SubTask UUID
    expert_type: str
    description: str
    input_data: dict[str, Any] = Field(default_factory=dict)
    sort_order: int = 0
    status: str = "pending"
    depends_on: list[str] = Field(default_factory=list)
    execution_mode: ExecutionMode = ExecutionMode.SEQUENTIAL

    # ---- 三条边界转换（全部显式，字段集由测试钉住）----

    def to_state_dict(self) -> dict[str, Any]:
        """→ 图状态里的任务 dict（键名见模块 docstring；运行时字段初始化为 None）"""
        return {
            STATE_KEY_UUID: self.subtask_id,
            STATE_KEY_SEMANTIC: self.id,
            "expert_type": self.expert_type,
            "description": self.description,
            "input_data": self.input_data,
            "sort_order": self.sort_order,
            "status": self.status,
            "depends_on": self.depends_on,
            "output_result": None,
            "started_at": None,
            "completed_at": None,
        }

    def to_event_task_dict(self) -> dict[str, Any]:
        """→ plan.created 事件里的一条任务（键集必须与 `TaskInfo` 一致，有测试）

        事件的 task id 用的是**落库 UUID**（前端拿它对齐计划卡片与任务事件），
        所以落库前调用会直接报错——宁可炸在转换处，也不要发出一个 id=None 的事件。
        """
        if self.subtask_id is None:
            raise ValueError(
                "计划任务尚未落库（subtask_id 为空）却要生成事件 payload；请先 attach_subtask_ids()"
            )
        return {
            "id": self.subtask_id,
            "expert_type": self.expert_type,
            "description": self.description,
            "sort_order": self.sort_order,
            "status": self.status,
            "depends_on": self.depends_on,
        }

    def to_subtask_create(self) -> SubTaskCreate:
        """→ 落库 DTO（`task_id` 即 Commander 语义 ID，供下游依赖匹配）

        长度守卫：task_description 超 500 字时截断并记日志（修订 LLM 可能
        产出超长描述；VARCHAR(500) 是历史遗留，已改 TEXT，但守卫保留作为
        护栏——超长描述对执行无意义，截断后仍可读）。
        """
        desc = self.description
        if len(desc) > 500:
            logger.warning(
                "[PlanTasks] 任务描述超长截断: %s 字 → 500 字（task_id=%s）",
                len(desc),
                self.id,
            )
            desc = desc[:497] + "..."
        return SubTaskCreate(
            expert_type=self.expert_type,
            task_description=desc,
            input_data=self.input_data,
            sort_order=self.sort_order,
            execution_mode=self.execution_mode,
            depends_on=self.depends_on or None,
            task_id=self.id,
        )


def build_plan_tasks(llm_tasks: list[Any]) -> list[PlanTask]:
    """LLM 输出的任务 → canonical 计划任务（此时还没有 subtask_id）。

    顺带做两件原本散在 commander 里的归一：
    - 缺 id 的按位置补 `task_{idx}`
    - 依赖写法归一，判定顺序是**先认已有 id、再认位置**：
      1. 值本身就等于某个任务的 id（`task_1`，或修订路径的 `"1"`）→ 原样保留；
      2. 否则按位置解释（历史行为 `{str(idx): task.id}`，0 基）——LLM 偶尔把依赖写成
         `"0"`/`"1"` 这种位置号。
      顺序不能反：修订路径的 id 就是数字（`"1"`/`"2"`），先按位置解释会把 `"1"` 错认
      成第二个任务（实测把 writer 的依赖接成了它自己）。
    """
    known_ids = {task.id for task in llm_tasks if task.id}
    id_by_index = {str(idx): (task.id or f"task_{idx}") for idx, task in enumerate(llm_tasks)}
    plan_tasks: list[PlanTask] = []
    normalized_total = 0

    for idx, task in enumerate(llm_tasks):
        semantic_id = task.id or f"task_{idx}"
        dependencies: list[str] = []
        for dep in task.depends_on or []:
            mapped = dep if dep in known_ids else id_by_index.get(dep, dep)
            if mapped != dep:
                normalized_total += 1
            dependencies.append(mapped)

        plan_tasks.append(
            PlanTask(
                id=semantic_id,
                expert_type=task.expert_type,
                description=task.description,
                input_data=task.input_data or {},
                sort_order=idx,
                status="pending",
                depends_on=dependencies,
                execution_mode=task.execution_mode,
            )
        )

    if normalized_total:
        logger.info("[PlanTasks] 已把 %d 处序号写法依赖归一成任务 ID", normalized_total)

    return plan_tasks


def attach_subtask_ids(
    plan_tasks: list[PlanTask], persisted_rows: list[dict[str, Any]]
) -> list[PlanTask]:
    """落库结果按位置回填 `subtask_id` / `sort_order` / `status`，返回新的列表。

    `persisted_rows` 是 `create_execution_plan_with_subtasks` 的返回，按 sort_order
    与传入 DTO 一一对应；配对逻辑只在这里做一次（此前状态 dict 与事件 dict 各自
    重新 zip 一次，错位了也没人发现）。
    """
    if len(persisted_rows) != len(plan_tasks):
        raise ValueError(
            f"落库任务数与计划任务数不一致：持久化 {len(persisted_rows)} 条 vs 计划 {len(plan_tasks)} 条"
        )

    attached: list[PlanTask] = []
    for idx, (plan_task, row) in enumerate(zip(plan_tasks, persisted_rows, strict=True)):
        attached.append(
            plan_task.model_copy(
                update={
                    "subtask_id": row.get("id"),
                    "sort_order": row.get("sort_order", idx),
                    "status": row.get("status", plan_task.status),
                }
            )
        )
    return attached
