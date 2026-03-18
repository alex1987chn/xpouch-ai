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
