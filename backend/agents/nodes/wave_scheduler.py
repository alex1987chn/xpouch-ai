"""波次调度：按依赖波次扇出任务、并把产物落回计划状态。

图里的形状（见 `agents/graph_builder.py`）：::

    commander → plan_approval → wave_dispatch ──Send──▶ expert_worker（执行子图）
                                     ▲                            │
                                     └────── task_join ◀──────────┘
                                                 │
                                          （无就绪任务时）→ aggregator

- `wave_dispatch`：扇出前的收口。把**永远不会就绪**的任务（上游失败 / 依赖成环）
  显式标为失败并写明原因——不标的话判定层会一直说「还有待执行任务」，执行器空转
  到 recursion_limit。判定本身全在 `agents/plan_waves.py`（纯函数，已被测试钉住）。
- `route_wave`（条件边）：把本轮该跑的任务用 `Send` 扇出（并发上限在此生效），
  没有就绪任务时转 aggregator 收尾。
- `task_join`：把产物落成 `task_list` 与 `expert_results`。它是这两个通道在**执行期
  的唯一写者**（并发分支不能写无 reducer 的通道，见 `agents/state.py`）。

## 失败策略（显式、集中在本模块，改策略只改这里）

- 一个任务失败 → **兄弟任务继续**（不 fail-fast）：检索类扇出要拿到部分结果。
- 依赖失败的任务 → 标记失败并注明「上游失败，已跳过」，**不让它带着缺失的上游硬跑**
  （那会产出看起来正常、其实基于空上下文的垃圾），也不让它默默消失。
- 依赖成环 → 标记失败并注明「依赖成环」（LLM 规划出错时的兜底，否则整轮卡死）。

## 并发上限

值由 `stream_service` 按「system_setting 优先、env 兜底」解析后放进 run 配置的
`configurable.graph_max_concurrency`（与 `mcp_tools` 同一个位置）；本模块只读不猜。
默认 1 = 串行：波次恒为「按 sort_order 的第一个就绪任务」，与接线前的行为一致。
"""

from __future__ import annotations

from typing import Any

from langchain_core.runnables import RunnableConfig
from langgraph.types import Send

from agents.plan_waves import plan_wave_decision, select_wave, task_key
from agents.state_patch import replace_task_item_by_key
from agents.task_outcome import (
    DEPENDENCY_CONTEXT_LIMIT,
    build_task_outcome,
    ordered_outcomes,
    outcome_task_patch,
    outcome_to_expert_result,
)
from models.enums import GraphTaskStatus
from utils.event_generator import event_task_failed
from utils.logger import logger
from utils.time import utc_now

EXPERT_WORKER_NODE = "expert_worker"
TASK_JOIN_NODE = "task_join"
AGGREGATOR_NODE = "aggregator"

# 串行兜底：run 配置没给（或给了非法值）时按一次一个跑，绝不默认并发。
DEFAULT_MAX_CONCURRENCY = 1

# 跑不了的原因（文案的唯一来源：事件、账本、状态三处用同一句）
REASON_UPSTREAM_FAILED = "上游任务失败，已跳过"
REASON_DEPENDENCY_CYCLE = "依赖成环，无法执行"


def _max_concurrency(config: RunnableConfig | None) -> int:
    """本轮并发上限（run 配置注入；非法值一律退回串行）。"""
    configurable = (config or {}).get("configurable") or {}
    value = configurable.get("graph_max_concurrency")
    return value if isinstance(value, int) and value > 0 else DEFAULT_MAX_CONCURRENCY


def build_branch_payload(state: dict[str, Any], task: dict[str, Any]) -> dict[str, Any]:
    """Send payload：分支能看到的**全部**输入。

    分支读不到主图其它通道（LangGraph 的 Send 只传 payload），所以上游输出必须在这里
    解析好带过去：从 `task_outcomes` 里取已完成依赖的产物（上一波已落）。缺失的依赖
    照旧交给 generic 的容错提示词处理（例如上游失败被跳过、或计划编辑删掉了任务）。

    运行标识打包进 `branch_context`：子图会把与自己 schema 同名的键**全部**写回主图，
    平铺 `thread_id` 这类键会让 N 个并发分支往主图无 reducer 的通道并发写同一个值
    （实测 InvalidUpdateError）——打包成一个主图没有的私有键即天然不回写。
    """
    outcomes = state.get("task_outcomes") or {}
    dependency_outputs: dict[str, str] = {}
    for dep in task.get("depends_on") or []:
        outcome = outcomes.get(str(dep))
        output = (outcome or {}).get("output")
        if output:
            dependency_outputs[str(dep)] = output[:DEPENDENCY_CONTEXT_LIMIT]

    return {
        "current_task": task,
        "dependency_outputs": dependency_outputs,
        "branch_context": {
            "thread_id": state.get("thread_id"),
            "run_id": state.get("run_id"),
            "execution_plan_id": state.get("execution_plan_id"),
            "user_id": state.get("user_id"),
        },
    }


async def wave_dispatch_node(
    state: dict[str, Any], config: RunnableConfig = None
) -> dict[str, Any]:
    """扇出前的收口：把永远不会就绪的任务显式标失败（计划里不再留 pending 的僵尸）。"""
    task_list = state.get("task_list") or []
    decision = plan_wave_decision(task_list)
    unreachable = [(key, REASON_UPSTREAM_FAILED) for key in decision.blocked] + [
        (key, REASON_DEPENDENCY_CYCLE) for key in decision.deadlocked
    ]
    if not unreachable:
        return {}

    by_key = {task_key(task): task for task in task_list}
    updated_task_list = task_list
    outcomes: dict[str, dict[str, Any]] = {}

    for key, reason in unreachable:
        task = by_key.get(key) or {}
        logger.warning(
            "[WaveDispatch] 任务无法执行 | reason=%s | task_key=%s | expert=%s",
            reason,
            key,
            task.get("expert_type"),
        )
        outcome = build_task_outcome(
            task,
            status=GraphTaskStatus.FAILED,
            output=reason,
            error=reason,
            completed_at=utc_now().isoformat(),
        )
        outcomes[outcome["task_key"]] = outcome
        updated_task_list = replace_task_item_by_key(
            updated_task_list, key, outcome_task_patch(outcome)
        )
        # 事件 + 账本：用户必须看到「为什么这个任务没跑」，静默跳过是最坏的
        await _announce_unreachable(state, task, key, reason)

    return {"task_list": updated_task_list, "task_outcomes": outcomes}


async def _announce_unreachable(
    state: dict[str, Any], task: dict[str, Any], key: str, reason: str
) -> None:
    """把一个「跑不了」的任务同时写进实时事件与运行事件账本。"""
    from agents.event_stream import emit_event

    await emit_event(
        event_task_failed(
            task_id=task.get("id") or key,
            expert_type=task.get("expert_type", ""),
            description=task.get("description", ""),
            error=reason,
        )
    )

    run_id = state.get("run_id")
    thread_id = state.get("thread_id")
    if not (run_id and thread_id):
        return
    try:
        from utils.async_task_queue import async_append_run_event, spawn_background

        spawn_background(
            async_append_run_event(
                run_id=run_id,
                event_type="task_failed",
                thread_id=thread_id,
                execution_plan_id=state.get("execution_plan_id"),
                task_id=str(task.get("id") or key),
                event_data={"expert_type": task.get("expert_type", ""), "error_message": reason},
            ),
            label=f"run_event:task_skipped:{key}",
        )
    except (RuntimeError, ValueError) as event_err:
        logger.warning("[WaveDispatch] ⚠️ 跳过任务的账本写入提交失败: %s", event_err)


def route_wave(state: dict[str, Any], config: RunnableConfig = None):
    """条件边：扇出本轮任务（Send），或转入聚合收尾。

    返回 `Send` 列表 = 并发扇出；返回节点名 = 单条边。
    """
    task_list = state.get("task_list") or []
    wave = select_wave(task_list, _max_concurrency(config))
    if not wave:
        # 没有任何就绪任务：要么计划跑完，要么剩下的都跑不了（已在 dispatch 标失败）
        return AGGREGATOR_NODE

    by_key = {task_key(task): task for task in task_list}
    sends = [
        Send(EXPERT_WORKER_NODE, build_branch_payload(state, by_key[key]))
        for key in wave
        if key in by_key
    ]
    if not sends:  # 理论上不可达（wave 的 key 都来自 task_list）；宁可收尾也不要空扇出
        logger.error("[WaveDispatch] ⚠️ 选中任务 %s 均不在计划里，直接收尾", wave)
        return AGGREGATOR_NODE

    logger.info(
        "[WaveDispatch] 本轮扇出 %d 个任务（并发上限 %d）: %s",
        len(sends),
        _max_concurrency(config),
        wave,
    )
    return sends


async def task_join_node(state: dict[str, Any], config: RunnableConfig = None) -> dict[str, Any]:
    """把产物落成 `task_list` / `expert_results`（本节点是二者执行期的唯一写者）。"""
    task_list = state.get("task_list") or []
    outcomes = state.get("task_outcomes") or {}
    if not outcomes:
        return {}

    by_key = {task_key(task): task for task in task_list}
    updated_task_list = task_list
    for key, outcome in outcomes.items():
        if key not in by_key:
            # 产物对不上计划项：只可能来自「计划在波次进行中被改写」或规划出的脏 id。
            # 不抛异常（那是把一次可用的运行整死），但必须让人看见——该任务会保持
            # pending 并在下一轮被再次选中。
            logger.error(
                "[TaskJoin] ⚠️ 产物找不到对应任务项，已忽略: task_key=%s（计划 keys=%s）",
                key,
                list(by_key),
            )
            continue
        updated_task_list = replace_task_item_by_key(
            updated_task_list, key, outcome_task_patch(outcome)
        )

    # 聚合顺序 = 计划顺序（sort_order），不是完成顺序：并发下完成顺序每次都不同，
    # 让聚合器按完成顺序读结果会让同一份计划的综述每次都不一样。
    expert_results = [outcome_to_expert_result(outcome) for outcome in ordered_outcomes(outcomes)]
    logger.info(
        "[TaskJoin] 已落状态 %d 个任务产物（计划 %d 项）", len(expert_results), len(task_list)
    )
    return {"task_list": updated_task_list, "expert_results": expert_results}
