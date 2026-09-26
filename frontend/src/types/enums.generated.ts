/**
 * ⚠️ 本文件由 `backend/scripts/gen_enums_ts.py` 生成，**不要手改**。
 *
 * 真相源：`backend/models/enums.py`（与数据库枚举、迁移同源）
 * 重新生成：`cd backend && .venv/Scripts/python -m scripts.gen_enums_ts`
 *
 * 每个枚举产出 `X_VALUES`（运行时常量数组）+ 同名联合类型；后端也有 pytest
 * 断言本文件是最新的——枚举漂移无法悄悄合入。
 */

/** UserRole（真相源：backend/models/enums.py） */
export const USER_ROLE_VALUES = ['user', 'admin'] as const
export type UserRole = (typeof USER_ROLE_VALUES)[number]

/** ConversationType（真相源：backend/models/enums.py） */
export const CONVERSATION_TYPE_VALUES = ['default', 'ai'] as const
export type ConversationType = (typeof CONVERSATION_TYPE_VALUES)[number]

/** ExpertType（真相源：backend/models/enums.py） */
export const EXPERT_TYPE_VALUES = ['search', 'coder', 'researcher', 'analyzer', 'writer', 'planner', 'image_analyzer', 'commander', 'router', 'aggregator', 'memorize_expert'] as const
export type ExpertType = (typeof EXPERT_TYPE_VALUES)[number]

/** TaskStatus（真相源：backend/models/enums.py） */
export const TASK_STATUS_VALUES = ['pending', 'waiting_for_approval', 'running', 'completed', 'failed', 'cancelled'] as const
export type TaskStatus = (typeof TASK_STATUS_VALUES)[number]

/** GraphTaskStatus（真相源：backend/models/enums.py） */
export const GRAPH_TASK_STATUS_VALUES = ['pending', 'in_progress', 'waiting_for_tool', 'completed', 'failed'] as const
export type GraphTaskStatus = (typeof GRAPH_TASK_STATUS_VALUES)[number]

/** RunStatus（真相源：backend/models/enums.py） */
export const RUN_STATUS_VALUES = ['queued', 'running', 'waiting_for_approval', 'resuming', 'completed', 'failed', 'cancelled', 'timed_out'] as const
export type RunStatus = (typeof RUN_STATUS_VALUES)[number]

/** ThreadStatus（真相源：backend/models/enums.py） */
export const THREAD_STATUS_VALUES = ['running', 'idle', 'paused'] as const
export type ThreadStatus = (typeof THREAD_STATUS_VALUES)[number]

/** ExecutionMode（真相源：backend/models/enums.py） */
export const EXECUTION_MODE_VALUES = ['sequential', 'parallel'] as const
export type ExecutionMode = (typeof EXECUTION_MODE_VALUES)[number]

/** RunEventType（真相源：backend/models/enums.py） */
export const RUN_EVENT_TYPE_VALUES = ['run_created', 'run_started', 'router_decided', 'plan_created', 'plan_updated', 'hitl_interrupted', 'hitl_resumed', 'hitl_rejected', 'hitl_revision_started', 'hitl_revision_failed', 'task_started', 'task_completed', 'task_failed', 'tool_result', 'artifact_generated', 'run_completed', 'run_failed', 'run_cancelled', 'run_timed_out'] as const
export type RunEventType = (typeof RUN_EVENT_TYPE_VALUES)[number]

/** ToolRiskTier（真相源：backend/models/enums.py） */
export const TOOL_RISK_TIER_VALUES = ['low', 'medium', 'high'] as const
export type ToolRiskTier = (typeof TOOL_RISK_TIER_VALUES)[number]

/** ToolPolicyAction（真相源：backend/models/enums.py） */
export const TOOL_POLICY_ACTION_VALUES = ['allow', 'deny', 'require_approval'] as const
export type ToolPolicyAction = (typeof TOOL_POLICY_ACTION_VALUES)[number]

export const TERMINAL_RUN_STATUSES = ['completed', 'failed', 'cancelled', 'timed_out'] as const

export const _NO_RENEW_RUN_STATUSES = ['resuming', 'completed', 'failed', 'cancelled', 'timed_out'] as const
