/**
 * SSE 事件类型定义
 * 统一前后端事件协议（与 backend/types/events.py 对应）
 */

import type { ThinkingStep } from './index'

// ============================================================================
// 事件类型枚举
// ============================================================================

export type EventType =
  // 规划阶段
  | 'plan.created'
  | 'plan.started'    // 🔥 新增：规划开始
  | 'plan.thinking'   // 🔥 新增：规划思考流式内容
  // 任务执行阶段
  | 'task.started'
  | 'task.progress'
  | 'task.completed'
  | 'task.failed'
  // 产物阶段 (v3.2.0: 仅保留批处理模式 artifact.generated)
  | 'artifact.generated'
  // 消息阶段
  | 'message.delta'
  | 'message.done'
  // 🔥🔥🔥 v3.1.0 HITL: 人类审核中断事件
  | 'human.interrupt'
  // 系统事件
  | 'router.start'
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
  depends_on?: string[]
}

export interface PlanCreatedData {
  execution_plan_id: string
  summary: string
  estimated_steps: number
  execution_mode: 'sequential' | 'parallel'
  tasks: TaskInfo[]
}

export type PlanCreatedEvent = SSEEvent<PlanCreatedData>

// 🔥 新增：Commander 流式思考事件数据类型

export interface PlanStartedData {
  execution_plan_id: string
  title: string
  content: string
  status: 'running'
}

export interface PlanThinkingData {
  execution_plan_id: string
  delta: string
}

export type PlanStartedEvent = SSEEvent<PlanStartedData>
export type PlanThinkingEvent = SSEEvent<PlanThinkingData>

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
// 任务进度事件（可选）
// ============================================================================

export interface TaskProgressData {
  task_id: string
  expert_type: string
  progress: number // 0.0 - 1.0
  message?: string // 进度消息，如"正在搜索..."
}

export type TaskProgressEvent = SSEEvent<TaskProgressData>

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

export interface ThinkingData {
  text?: string
  steps?: ThinkingStep[]
}

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
  thinking?: ThinkingData  // 思考过程数据（类似 DeepSeek Chat）
}

export type MessageDoneEvent = SSEEvent<MessageDoneData>

// ============================================================================
// 系统事件
// ============================================================================

export interface RouterStartData {
  query: string
  timestamp: string
}

export type RouterStartEvent = SSEEvent<RouterStartData>

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
// 🔥🔥🔥 v3.1.0 HITL: 人类审核中断事件
// ============================================================================

export interface HumanInterruptData {
  type: 'plan_review'
  run_id?: string
  execution_plan_id?: string
  plan_version: number
  current_plan: Array<{
    id: string
    expert_type: string
    description: string
    sort_order: number
    status: 'pending' | 'running' | 'completed' | 'failed'
    depends_on?: string[] // 🔥 任务依赖关系
  }>
}

export type HumanInterruptEvent = SSEEvent<HumanInterruptData>

// ============================================================================
// 联合类型
// ============================================================================

export type AnyServerEvent =
  | PlanCreatedEvent
  | PlanStartedEvent      // 🔥 新增
  | PlanThinkingEvent     // 🔥 新增
  | TaskStartedEvent
  | TaskProgressEvent     // 🔥 新增
  | TaskCompletedEvent
  | TaskFailedEvent
  | ArtifactGeneratedEvent
  | MessageDeltaEvent
  | MessageDoneEvent
  | HumanInterruptEvent     // 🔥🔥🔥 v3.1.0 HITL
  | RouterStartEvent
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
