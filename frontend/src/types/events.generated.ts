/**
 * ⚠️ 本文件由 `backend/scripts/gen_event_types_ts.py` 生成，**不要手改**。
 *
 * 真相源：`backend/event_types/events.py`（EventType 枚举 + 各事件的 pydantic 模型）
 * 重新生成：`cd backend && .venv/Scripts/python -m scripts.gen_event_types_ts`
 *
 * 前端手写的 `types/events.ts` 会与这里的每条 payload 类型做双向一致性断言，
 * 后端也有 pytest 断言本文件是最新的——协议漂移在两侧都无法悄悄合入。
 */

export type EventType =
  | 'plan.created'
  | 'plan.started'
  | 'plan.thinking'
  | 'task.started'
  | 'task.progress'
  | 'task.completed'
  | 'task.failed'
  | 'artifact.generated'
  | 'message.delta'
  | 'message.thinking'
  | 'message.done'
  | 'human.interrupt'
  | 'router.start'
  | 'router.decision'
  | 'error'

export interface TaskInfo {
  id: string
  expert_type: string
  description: string
  sort_order: number
  status?: string
  depends_on?: string[]
}

export interface ArtifactInfo {
  id: string
  type: string
  title: string | null
  content: string
  language: string | null
  sort_order: number
}

export interface PlanCreatedData {
  execution_plan_id: string
  summary: string
  estimated_steps: number
  execution_mode: string
  tasks: TaskInfo[]
}

export interface PlanStartedData {
  execution_plan_id: string
  title?: string
  content?: string
  status?: string
}

export interface PlanThinkingData {
  execution_plan_id: string
  delta: string
}

export interface TaskStartedData {
  task_id: string
  expert_type: string
  description: string
  started_at: string
}

export interface TaskProgressData {
  task_id: string
  expert_type: string
  progress: number
  message?: string | null
}

export interface TaskCompletedData {
  task_id: string
  expert_type: string
  description: string
  status?: string
  output?: string | null
  duration_ms: number
  completed_at: string
  artifact_count?: number
}

export interface TaskFailedData {
  task_id: string
  expert_type: string
  description: string
  error: string
  failed_at: string
}

export interface ArtifactGeneratedData {
  task_id: string
  expert_type: string
  artifact: ArtifactInfo
}

export interface MessageDeltaData {
  message_id: string
  content: string
  is_final?: boolean
}

export interface MessageThinkingData {
  message_id: string
  content: string
}

export interface MessageDoneData {
  message_id: string
  full_content: string
  total_tokens?: number | null
  thinking?: Record<string, unknown> | null
}

export interface HumanInterruptData {
  type?: string
  run_id?: string | null
  execution_plan_id?: string | null
  current_plan: Record<string, unknown>[]
  plan_version?: number
}

export interface RouterStartData {
  query: string
  timestamp: string
}

export interface RouterDecisionData {
  decision: string
  reason?: string | null
}

export interface ErrorData {
  code: string
  message: string
  details?: Record<string, unknown> | null
}

export interface EventPayloadMap {
  'plan.created': PlanCreatedData,
  'plan.started': PlanStartedData,
  'plan.thinking': PlanThinkingData,
  'task.started': TaskStartedData,
  'task.progress': TaskProgressData,
  'task.completed': TaskCompletedData,
  'task.failed': TaskFailedData,
  'artifact.generated': ArtifactGeneratedData,
  'message.delta': MessageDeltaData,
  'message.thinking': MessageThinkingData,
  'message.done': MessageDoneData,
  'human.interrupt': HumanInterruptData,
  'router.start': RouterStartData,
  'router.decision': RouterDecisionData,
  'error': ErrorData,
}
