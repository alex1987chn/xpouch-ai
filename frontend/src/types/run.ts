/**
 * 运行事件相关类型定义
 * 
 * 与后端 RunEventType 和 RunEvent 保持一致
 */

// ============================================
// 运行事件类型枚举
// ============================================

/**
 * 运行事件类型 - 与后端 RunEventType 保持一致
 */
export type RunEventType =
  // 生命周期事件
  | 'run_created'
  | 'run_started'
  // 路由事件
  | 'router_decided'
  // 计划事件（复杂模式）
  | 'plan_created'
  | 'plan_updated'
  // HITL 事件
  | 'hitl_interrupted'
  | 'hitl_resumed'
  | 'hitl_rejected'
  // 任务执行事件
  | 'task_started'
  | 'task_completed'
  | 'task_failed'
  // 产物事件
  | 'artifact_generated'
  // 终态事件
  | 'run_completed'
  | 'run_failed'
  | 'run_cancelled'
  | 'run_timed_out'

/**
 * 终态事件列表
 */
export const TERMINAL_EVENTS: RunEventType[] = [
  'run_completed',
  'run_failed',
  'run_cancelled',
  'run_timed_out',
]

// ============================================
// 运行状态枚举
// ============================================

/**
 * 运行状态 - 与后端 RunStatus 保持一致
 */
export type RunStatus =
  | 'queued'
  | 'running'
  | 'waiting_for_approval'
  | 'resuming'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timed_out'

/**
 * 活跃运行状态（不允许同线程并发）
 */
export const ACTIVE_RUN_STATUSES: RunStatus[] = [
  'queued',
  'running',
  'waiting_for_approval',
  'resuming',
]

// ============================================
// 运行事件接口
// ============================================

/**
 * 运行事件响应
 */
export interface RunEvent {
  id: number
  run_id: string
  event_type: RunEventType
  timestamp: string
  event_data?: Record<string, unknown>
  thread_id?: string
  execution_plan_id?: string
  task_id?: string
  note?: string
}

/**
 * 运行实例摘要（用于列表展示）
 */
export interface RunSummary {
  id: string
  thread_id: string
  user_id: string
  entrypoint: string
  mode: 'simple' | 'complex'
  status: RunStatus
  current_node?: string
  error_code?: string
  error_message?: string
  created_at: string
  started_at?: string
  updated_at: string
  last_heartbeat_at?: string
  completed_at?: string
  cancelled_at?: string
  timed_out_at?: string
  deadline_at?: string
}

// ============================================
// API 响应类型
// ============================================

/**
 * 运行时间线 API 响应
 */
export interface RunTimelineResponse {
  run_id: string
  events: RunEvent[]
  total: number
}

/**
 * 线程时间线 API 响应
 */
export interface ThreadTimelineResponse {
  thread_id: string
  events: RunEvent[]
  total: number
}

// ============================================
// 工具函数
// ============================================

/**
 * 判断事件是否为终态
 */
export function isTerminalEvent(eventType: RunEventType): boolean {
  return TERMINAL_EVENTS.includes(eventType)
}

/**
 * 判断运行是否活跃
 */
export function isRunActive(status: RunStatus): boolean {
  return ACTIVE_RUN_STATUSES.includes(status)
}

/**
 * 获取事件分类
 */
export function getEventCategory(eventType: RunEventType): string {
  if (eventType.startsWith('run_')) return 'lifecycle'
  if (eventType.startsWith('router_')) return 'router'
  if (eventType.startsWith('plan_')) return 'plan'
  if (eventType.startsWith('hitl_')) return 'hitl'
  if (eventType.startsWith('task_')) return 'task'
  if (eventType.startsWith('artifact_')) return 'artifact'
  return 'other'
}

/**
 * 获取事件的中文名称
 */
export function getEventDisplayName(eventType: RunEventType): string {
  const names: Record<RunEventType, string> = {
    run_created: '运行创建',
    run_started: '运行开始',
    router_decided: '路由决策',
    plan_created: '计划创建',
    plan_updated: '计划更新',
    hitl_interrupted: '等待审核',
    hitl_resumed: '审核通过',
    hitl_rejected: '审核拒绝',
    task_started: '任务开始',
    task_completed: '任务完成',
    task_failed: '任务失败',
    artifact_generated: '产物生成',
    run_completed: '运行完成',
    run_failed: '运行失败',
    run_cancelled: '运行取消',
    run_timed_out: '运行超时',
  }
  return names[eventType] || eventType
}
