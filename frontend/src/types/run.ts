/**
 * 运行事件相关类型定义
 *
 * 契约真相源是后端 schemas/run_event.py（→ api.generated.ts）：
 * RunEventType / RunStatus re-export 自 enums.generated，形状接口由
 * 底部 SameShape 锚点与生成物逐字段锁定（含可选性与 null）。
 */

import type { components } from '@/types/api.generated'
import {
  RUN_STATUS_VALUES,
  TERMINAL_RUN_STATUSES,
  type RunEventType,
  type RunStatus,
} from './enums.generated'

// ============================================
// 运行事件类型枚举
// ============================================

// RunEventType / RunStatus 由后端 models/enums.py 生成（见 enums.generated.ts）。
// 这里原本是手抄的字面量联合 + "与后端保持一致"的注释——注释不是闸门：手抄那份已经
// 少了 hitl_revision_started / hitl_revision_failed 两个成员（少成员不会编译报错，
// 于是前端静默不识别它们的事件分类与显示名）。
export type { RunEventType, RunStatus }

/**
 * 终态事件列表（前端语义：哪些事件标志运行结束）。
 *
 * 状态侧的终态集合来自后端（TERMINAL_RUN_STATUSES）；事件侧后端没有对应常量，
 * 故在此显式列出——成员受 RunEventType 约束，改名/删成员会编译报错。
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
 * 活跃运行状态（不允许同线程并发）= 全部状态 - 后端定义的终态集合。
 *
 * 派生而非手抄：后端新增状态时这里自动跟随，不会漏（手抄版就漏过）。
 */
const TERMINAL_STATUS_SET: ReadonlySet<string> = new Set(TERMINAL_RUN_STATUSES)

export const ACTIVE_RUN_STATUSES: RunStatus[] = RUN_STATUS_VALUES.filter(
  status => !TERMINAL_STATUS_SET.has(status)
)

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
  created_at: string
  event_data?: Record<string, unknown> | null
  thread_id?: string | null
  execution_plan_id?: string | null
  task_id?: string | null
  note?: string | null
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
  current_node?: string | null
  error_code?: string | null
  error_message?: string | null
  created_at: string
  started_at?: string | null
  updated_at: string
  last_heartbeat_at?: string | null
  completed_at?: string | null
  cancelled_at?: string | null
  timed_out_at?: string | null
  deadline_at?: string | null
}

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
// REST 契约锚点（范式沿 types/events.ts 的 SameShape / services/stats.ts）
// ============================================

/** 双向相等：手写类型与后端生成类型**逐字段一致**（含可选性与 null）。 */
type SameShape<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type Assert<T extends true> = T

type Schemas = components['schemas']
type _RunEvent = Assert<SameShape<RunEvent, Schemas['RunEventResponse']>>
type _RunSummary = Assert<SameShape<RunSummary, Schemas['RunSummaryResponse']>>
type _RunTimeline = Assert<SameShape<RunTimelineResponse, Schemas['RunTimelineResponse']>>
type _ThreadTimeline = Assert<
  SameShape<ThreadTimelineResponse, Schemas['ThreadTimelineResponse']>
>

/** 上面这组断言只做编译期校验，导出以免被 noUnusedLocals 误报 */
export type RunConformanceAnchors = [
  _RunEvent,
  _RunSummary,
  _RunTimeline,
  _ThreadTimeline,
]

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
    hitl_revision_started: '修订开始',
    hitl_revision_failed: '修订失败',
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
