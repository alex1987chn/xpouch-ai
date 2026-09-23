/**
 * 统计相关类型定义
 *
 * 契约真相源是后端 schemas/stats.py（→ api.generated.ts）；
 * 底部 SameShape 锚点锁住手写类型与生成物逐字段一致。
 */

import type { components } from '@/types/api.generated'
import type { RunStatus } from './run'

/**
 * 运行核心指标
 */
export interface RunMetrics {
  total_runs: number
  success_count: number
  failed_count: number
  hitl_count: number
  avg_duration_ms: number
  success_rate: number
}

/**
 * 每日趋势数据
 */
export interface DailyTrend {
  date: string
  total_count: number
  success_count: number
  failed_count: number
}

/**
 * 运行列表项
 */
export interface RunListItem {
  run_id: string
  thread_id: string
  user_id: string | null
  user_name: string | null
  /** 可空 str（跟随契约）：NULL=路由决策前终止；后端对存量 "router" 值宽容 */
  mode: string | null
  status: RunStatus
  duration_ms: number | null
  created_at: string
  completed_at: string | null
}

/**
 * 运行统计响应
 */
export interface RunStatsResponse {
  is_admin: boolean

  // 今日 token 用量与每用户日配额（null = 不限量）
  today_tokens: number
  daily_token_quota: number | null
  metrics: RunMetrics
  trends: DailyTrend[]
  runs: RunListItem[]
  total_runs_count: number
  limit: number
  offset: number
}

// ============================================
// REST 契约锚点（范式沿 types/events.ts 的 SameShape / services/stats.ts）
// ============================================

/** 双向相等：手写类型与后端生成类型**逐字段一致**（含可选性与 null）。 */
type SameShape<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type Assert<T extends true> = T

type Schemas = components['schemas']
type _RunMetrics = Assert<SameShape<RunMetrics, Schemas['RunMetrics']>>
type _DailyTrend = Assert<SameShape<DailyTrend, Schemas['DailyTrend']>>
type _RunListItem = Assert<SameShape<RunListItem, Schemas['RunListItem']>>
type _RunStatsResponse = Assert<SameShape<RunStatsResponse, Schemas['RunStatsResponse']>>

/** 上面这组断言只做编译期校验，导出以免被 noUnusedLocals 误报 */
export type StatsConformanceAnchors = [
  _RunMetrics,
  _DailyTrend,
  _RunListItem,
  _RunStatsResponse,
]
