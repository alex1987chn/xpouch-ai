/**
 * 运行实例相关 API 服务
 */

import { buildUrl, handleResponse, authenticatedFetch } from './common'
import type { RunStatus } from '@/types/run'

/**
 * 运行状态响应（轻量级，专供轮询使用）
 */
export interface RunStatusResponse {
  id: string
  status: RunStatus
  current_node: string | null
  completed_at: string | null
}

/**
 * 查询单个运行实例状态（轻量级，用于轮询）
 */
export async function getRunStatus(runId: string): Promise<RunStatusResponse> {
  const response = await authenticatedFetch(buildUrl(`/runs/${runId}/status`))
  return handleResponse<RunStatusResponse>(response, '获取运行状态失败')
}


export interface RunPlanTask {
  id: string
  expert_type: string
  description: string
  sort_order: number
  depends_on: string[]
}

export interface RunPlanStatus {
  run_id: string
  plan_id: string | null
  plan_version: number
  status: string
  revising: boolean
  revision_error: string | null
  tasks: RunPlanTask[]
}

/**
 * 计划状态轮询（HITL 修订专供）
 * revising=true 表示专家修订中；plan_version 大于本地值即 v(n+1) 就绪
 */
export async function getRunPlanStatus(runId: string): Promise<RunPlanStatus> {
  const response = await authenticatedFetch(buildUrl(`/runs/${runId}/plan`))
  return handleResponse<RunPlanStatus>(response, '获取计划状态失败')
}
