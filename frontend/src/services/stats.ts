/**
 * 统计 API 服务
 */

import { authenticatedFetch, buildUrl, handleResponse } from './common'
import type { RunStatsResponse } from '@/types/stats'

/**
 * 获取运行统计
 */
export async function getRunStats(
  limit: number = 50,
  offset: number = 0,
  days: number = 7
): Promise<RunStatsResponse> {
  const url = buildUrl(`/admin/stats/runs?limit=${limit}&offset=${offset}&days=${days}`)
  const response = await authenticatedFetch(url)
  return handleResponse<RunStatsResponse>(response, '获取运行统计失败')
}
