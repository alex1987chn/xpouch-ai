/**
 * SSE 事件类型定义
 * 统一前后端事件协议（与 backend/types/events.py 对应）
 */

// ============================================================================
// 事件类型枚举
// ============================================================================

export type EventType =
  // 规划阶段
  | 'plan.created'
  // 任务执行阶段
  | 'task.started'
  | 'task.progress'
  | 'task.completed'
  | 'task.failed'
  // 产物阶段
  | 'artifact.generated'
  // 消息阶段
  | 'message.delta'
  | 'message.done'
  // 系统事件
  | 'router.decision'
  | 'error'

// ============================================================================
// 基础事件结构
// ============================================================================

export interface SSEEvent<T = unknown> {
  id: string
  timestamp: string
  type: EventType
  data: T
}

// ============================================================================
// 规划阶段事件
// ============================================================================

export interface TaskInfo {
  id: string
  expert_type: string
  description: string
  sort_order: number
  status: 'pending' | 'running' | 'completed' | 'failed'
}

export interface PlanCreatedData {
  session_id: string
  summary: string
  estimated_steps: number
  execution_mode: 'sequential' | 'parallel'
  tasks: TaskInfo[]
}

export type PlanCreatedEvent = SSEEvent<PlanCreatedData>

// ============================================================================
// 任务执行阶段事件
// ============================================================================

export interface TaskStartedData {
  task_id: string
  expert_type: string
  description: string
  started_at: string
}


export type TaskStartedEvent = SSEEvent<TaskStartedData>

export interface TaskCompletedData {
  task_id: string
  expert_type: string
  description: string
  status: 'completed'
  output?: string
  duration_ms: number
  completed_at: string
  artifact_count: number
}

export type TaskCompletedEvent = SSEEvent<TaskCompletedData>

export interface TaskFailedData {
  task_id: string
  expert_type: string
  description: string
  error: string
  failed_at: string
}

export type TaskFailedEvent = SSEEvent<TaskFailedData>

// ============================================================================
// 产物阶段事件
// ============================================================================

export interface ArtifactInfo {
  id: string
  type: 'code' | 'html' | 'markdown' | 'json' | 'text'
  title?: string
  content: string
  language?: string
  sort_order: number
}

export interface ArtifactGeneratedData {
  task_id: string
  expert_type: string
  artifact: ArtifactInfo
}

export type ArtifactGeneratedEvent = SSEEvent<ArtifactGeneratedData>

// ============================================================================
// 消息阶段事件
// ============================================================================

export interface MessageDeltaData {
  message_id: string
  content: string
  is_final?: boolean
}

export type MessageDeltaEvent = SSEEvent<MessageDeltaData>

export interface MessageDoneData {
  message_id: string
  full_content: string
  total_tokens?: number
}

export type MessageDoneEvent = SSEEvent<MessageDoneData>

// ============================================================================
// 系统事件
// ============================================================================

export interface RouterDecisionData {
  decision: 'simple' | 'complex'
  reason?: string
}

export type RouterDecisionEvent = SSEEvent<RouterDecisionData>

export interface ErrorData {
  code: string
  message: string
  details?: Record<string, unknown>
}

export type ErrorEvent = SSEEvent<ErrorData>

// ============================================================================
// 联合类型
// ============================================================================

export type AnyServerEvent =
  | PlanCreatedEvent
  | TaskStartedEvent
  | TaskCompletedEvent
  | TaskFailedEvent
  | ArtifactGeneratedEvent
  | MessageDeltaEvent
  | MessageDoneEvent
  | RouterDecisionEvent
  | ErrorEvent

// ============================================================================
// 事件解析工具
// ============================================================================

/**
 * 解析 SSE 事件数据
 */
export function parseSSEEvent(data: unknown): AnyServerEvent | null {
  if (typeof data !== 'object' || data === null) {
    return null
  }

  const event = data as SSEEvent<unknown>

  if (!event.type || !event.data) {
    return null
  }

  return event as AnyServerEvent
}
