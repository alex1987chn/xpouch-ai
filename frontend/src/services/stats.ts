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
  days: number = 7,
  search?: string
): Promise<RunStatsResponse> {
  const searchParam = search?.trim() ? `&search=${encodeURIComponent(search.trim())}` : ''
  const url = buildUrl(`/admin/stats/runs?limit=${limit}&offset=${offset}&days=${days}${searchParam}`)
  const response = await authenticatedFetch(url)
  return handleResponse<RunStatsResponse>(response, '获取运行统计失败')
}
