/**
 * 统计相关类型定义
 */

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
  mode: string
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
  metrics: RunMetrics
  trends: DailyTrend[]
  runs: RunListItem[]
  total_runs_count: number
  limit: number
  offset: number
}
