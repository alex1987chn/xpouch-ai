/**
 * 运行时间线 API 服务
 * 
 * 提供运行时间线和运行详情的 API 调用。
 */

import { authenticatedFetch, buildUrl, handleResponse } from './common'
import type { RunTimelineResponse, ThreadTimelineResponse, RunSummary } from '@/types/run'
import { logger } from '@/utils/logger'

/**
 * 获取运行实例的事件时间线
 * 
 * @param runId 运行实例 ID
 * @param limit 返回数量限制（默认 100，最大 1000）
 * @param offset 偏移量（用于分页)
 */
export async function getRunTimeline(
  runId: string,
  limit: number = 100,
  offset: number = 0
): Promise<RunTimelineResponse> {
  logger.debug(`[Runs API] 获取运行时间线: runId=${runId}`)
  
  const url = buildUrl(`/runs/${runId}/timeline?limit=${limit}&offset=${offset}`)
  const response = await authenticatedFetch(url)
  
  return handleResponse<RunTimelineResponse>(response, '获取运行时间线失败')
}

/**
 * 获取线程的事件时间线
 * 
 * @param threadId 线程 ID
 * @param limit 返回数量限制（默认 200，最大 1000）
 * @param offset 偏移量（用于分页)
 */
export async function getThreadTimeline(
  threadId: string,
  limit: number = 200,
  offset: number = 0
): Promise<ThreadTimelineResponse> {
  logger.debug(`[Runs API] 获取线程时间线: threadId=${threadId}`)
  
  const url = buildUrl(`/runs/thread/${threadId}/timeline?limit=${limit}&offset=${offset}`)
  const response = await authenticatedFetch(url)
  
  return handleResponse<ThreadTimelineResponse>(response, '获取线程时间线失败')
}

/**
 * 获取运行实例详情
 * 
 * @param runId 运行实例 ID
 */
export async function getRunDetails(runId: string): Promise<RunSummary> {
  logger.debug(`[Runs API] 获取运行详情: runId=${runId}`)
  
  const url = buildUrl(`/runs/${runId}`)
  const response = await authenticatedFetch(url)
  
  return handleResponse<RunSummary>(response, '获取运行详情失败')
}
