/**
 * =============================
 * Run Timeline Query Hook
 * =============================
 *
 * 使用 React Query 管理运行时间线数据获取
 *
 * [职责]
 * 1. 获取单个运行实例的时间线事件
 * 2. 获取线程下所有运行的时间线事件
 * 3. 获取运行实例详情
 */

import { useQuery } from '@tanstack/react-query'
import { getRunTimeline, getThreadTimeline, getRunDetails } from '@/services/runs'
import { logger } from '@/utils/logger'
import { CACHE_TIMES } from '@/config/query'

// Query Key 工厂函数
export const runKeys = {
  all: ['runs'] as const,
  details: () => [...runKeys.all, 'detail'] as const,
  detail: (runId: string) => [...runKeys.details(), runId] as const,
  timelines: () => [...runKeys.all, 'timeline'] as const,
  timeline: (runId: string) => [...runKeys.timelines(), runId] as const,
  threadTimeline: (threadId: string) => [...runKeys.timelines(), 'thread', threadId] as const,
}

/**
 * 获取运行实例详情
 */
export function useRunDetails(runId: string | null) {
  return useQuery({
    queryKey: runKeys.detail(runId || ''),
    queryFn: async () => {
      if (!runId) {
        throw new Error('Run ID is required')
      }
      logger.debug('[useRunDetails] Fetching run details:', runId)
      return getRunDetails(runId)
    },
    enabled: !!runId,
    staleTime: CACHE_TIMES.CHAT_SESSION.staleTime,
    gcTime: CACHE_TIMES.CHAT_SESSION.gcTime,
    retry: 2,
  })
}

/**
 * 获取运行实例的时间线事件
 */
export function useRunTimeline(runId: string | null, limit: number = 100) {
  return useQuery({
    queryKey: runKeys.timeline(runId || ''),
    queryFn: async () => {
      if (!runId) {
        throw new Error('Run ID is required')
      }
      logger.debug('[useRunTimeline] Fetching run timeline:', runId)
      return getRunTimeline(runId, limit)
    },
    enabled: !!runId,
    staleTime: CACHE_TIMES.CHAT_SESSION.staleTime,
    gcTime: CACHE_TIMES.CHAT_SESSION.gcTime,
    retry: 2,
  })
}

/**
 * 获取线程下所有运行的时间线事件
 */
export function useThreadTimeline(threadId: string | null, limit: number = 200) {
  return useQuery({
    queryKey: runKeys.threadTimeline(threadId || ''),
    queryFn: async () => {
      if (!threadId) {
        throw new Error('Thread ID is required')
      }
      logger.debug('[useThreadTimeline] Fetching thread timeline:', threadId)
      return getThreadTimeline(threadId, limit)
    },
    enabled: !!threadId,
    staleTime: CACHE_TIMES.CHAT_SESSION.staleTime,
    gcTime: CACHE_TIMES.CHAT_SESSION.gcTime,
    retry: 2,
  })
}
