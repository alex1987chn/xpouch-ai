"""
LangGraph 状态定义

集中管理所有 AgentState 类型定义，供 nodes/ 和 graph_builder.py 共享

**键的读者/写者必须清楚**（C2 起执行侧改为按波次 Send 扇出）：
- `messages`：会话历史。**分支不写它**——一个任务的工具循环草稿在子图的
  `worker_messages` 里（N 个并发分支往同一通道写既冲突又无意义）。复杂模式
  最后一条由 aggregator 追加（聚合综述），`stream_service` 的落库前校验依赖
  「最后一条是 AIMessage」。
- `task_list`：计划（含各任务状态）。**唯一写者** = commander（建计划）/
  wave_scheduler（把产物落成状态、把跑不了的任务标失败）/ 计划编辑的
  `aupdate_state`。分支不写它：并发写一个无 reducer 的通道会直接
  InvalidUpdateError（实测），且计划编辑需要「整表替换」语义。
- `task_outcomes`：分支产物汇总（唯一有 reducer 的执行通道）。分支各写自己
  那一个 key，父图按 key 合并；wave_scheduler 据此派生 `task_list` 与
  `expert_results`，两个派生动作都是幂等的，可重复执行。
- `expert_results`：聚合器的输入，由 wave_scheduler 从 `task_outcomes`
  派生（**按 sort_order 排序**，不是完成顺序）。
"""

from typing import Annotated, Any, TypedDict

from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages


def merge_task_outcomes(
    left: dict[str, dict[str, Any]] | None, right: dict[str, dict[str, Any]] | None
) -> dict[str, dict[str, Any]]:
    """任务产物的合并规约（主图与子图共用）。

    key = 任务的依赖空间标识（commander 语义 id，退回 db uuid），value = 该任务的
    产物字典（见 `agents/expert_worker.py` 的 outcome 形状）。

    语义：同 key 覆盖、异 key 并存 —— 天然幂等，所以「扇出后合并」与「重复应用」
    都是安全的（子图内部、父图扇入、wave_scheduler 重算都走这一个规约）。
    """
    merged = dict(left or {})
    merged.update(right or {})
    return merged


class AgentState(TypedDict):
    """超智能体的全局状态"""

    messages: Annotated[list[BaseMessage], add_messages]
    task_list: list[dict[str, Any]]
    # 分支产物汇总（分支唯一可写的执行通道；见模块 docstring）
    task_outcomes: Annotated[dict[str, dict[str, Any]], merge_task_outcomes]
    strategy: str
    expert_results: list[dict[str, Any]]
    final_response: str
    # 记录路由决策信息
    router_decision: str
    # v3.0 新增：数据库持久化相关
    thread_id: str | None  # 关联的对话ID
    run_id: str | None  # 当前运行实例 ID
    user_id: str | None  # 当前用户 ID
    execution_plan_id: str | None  # 复杂执行计划 ID
    # 计划的「预览 ID」：commander 首次执行时生成，随状态持久化。
    # 必须声明在此——LangGraph 会过滤未声明的键，此前它未声明导致每次
    # 执行都新生成 uuid，"plan.started 事件 id 与落库计划 id 一致" 从未成立。
    preview_execution_plan_id: str | None
    message_id: str | None  # 本次消息 ID（SSE 事件与 DB 消息关联，贯穿全图）
    # 人工审批裁决（plan_approval 节点写入）：approve / revise / terminate
    approval_action: str | None
    # Stage 3 跨轮产物连续性：本会话最近产物的有界摘要（id/type/title/expert/内容头），
    # 供 Commander 规划时知晓可引用/可修改的既有产物；完整内容由专家经 get_artifact 按需读取
    recent_artifacts: list[dict[str, Any]]
    # v3.4 新增：用户模型偏好（simple 模式使用，来自 user_settings 表）
    simple_model: str | None  # 用户选择的模型 ID，None = 跟随系统默认
    simple_thinking: str | None  # 思考模式偏好：auto/enabled/disabled
    # v3.0 的 event_queue 已随事件协议 v2（emit_event/custom stream）移除
    #
    # 已删除（C2，2026-09-13）：
    # - `current_task_index`：单任务游标，与 plan_waves 的波次判定是两套语义，
    #   留着必然漂移（决定 5）。任务的选中改由 wave_scheduler 按依赖算。
    # - `last_expert_result`：分支的执行结果，并发扇出下 N 个分支写同一通道会
    #   InvalidUpdateError；其唯一消费者（stream_service 的结果收集）改读
    #   `task_outcomes`。
