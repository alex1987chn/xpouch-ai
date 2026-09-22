/**
 * =============================
 * Chat History Query Hook
 * =============================
 *
 * 使用 React Query 管理聊天历史记录数据获取（支持分页）
 * 替代传统的 useEffect + useState 模式
 *
 * [优势]
 * 1. 自动缓存：避免重复请求
 * 2. 后台刷新：staleTime 过期后自动重新获取
 * 3. 错误重试：内置指数退避重试机制
 * 4. 乐观更新：支持乐观更新 UI
 * 5. 分页加载：支持无限滚动加载更多
 *
 * [配置]
 * - staleTime: 5分钟，避免频繁请求
 * - gcTime: 10分钟，缓存数据保留时间
 * - limit: 每页20条，减少首屏加载时间
 */

import { useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query'
import { getThreads, deleteThread } from '@/services/chat'
import { logger } from '@/utils/logger'
import { CACHE_TIMES } from '@/config/query'

interface StatusError {
  status?: number
}

function isStatusError(error: unknown): error is StatusError {
  return typeof error === 'object' && error !== null && 'status' in error
}

// Query Key 工厂函数 - 统一管理中心化 Query Keys
export const chatHistoryKeys = {
  all: ['chatHistory'] as const,
  lists: () => [...chatHistoryKeys.all, 'list'] as const,
  list: (filters: { search?: string; limit?: number } = {}) =>
    [...chatHistoryKeys.lists(), filters] as const,
  details: () => [...chatHistoryKeys.all, 'detail'] as const,
  detail: (id: string) => [...chatHistoryKeys.details(), id] as const,
}

/**
 * 获取历史记录列表的 Infinite Query Hook（分页/无限滚动）
 * 
 * 使用 useInfiniteQuery 实现滚动加载更多功能
 * - 首屏只加载20条，大幅提升加载速度
 * - 滚动到底部自动加载下一页
 * - 缓存每一页数据，避免重复请求
 */
export function useChatHistoryQuery(options: { limit?: number; enabled?: boolean } = {}) {
  const { limit = 20, enabled = true } = options

  return useInfiniteQuery({
    queryKey: chatHistoryKeys.list({ limit }),
    queryFn: async ({ pageParam = 1 }) => {
      try {
        const result = await getThreads(pageParam, limit)
        logger.debug('[useChatHistoryQuery] Fetched page:', pageParam, 'count:', result.items.length, 'total:', result.total)
        return result
      } catch (error) {
        logger.error('[useChatHistoryQuery] Failed to fetch threads:', error)
        throw error
      }
    },
    getNextPageParam: (lastPage) => {
      // 如果还有下一页，返回下一页页码
      if (lastPage.page < lastPage.pages) {
        return lastPage.page + 1
      }
      return undefined
    },
    initialPageParam: 1,
    // 聊天历史使用统一缓存配置
    staleTime: CACHE_TIMES.CHAT_HISTORY.staleTime,
    gcTime: CACHE_TIMES.CHAT_HISTORY.gcTime,
    // 错误时重试：401 不重试，其他错误重试2次
    retry: (failureCount, error: unknown) => {
      // 401 未授权不 retry，避免无限循环
      if (isStatusError(error) && error.status === 401) return false
      return failureCount < 2
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    // 组件挂载时如果数据是 stale 的，自动重新获取
    refetchOnMount: 'always',
    // 窗口重新获得焦点时对账（2026-09-13 由 false 改为 true）。
    //
    // 为什么改：会话行右侧的状态 chip（待审核/运行中）来自 `latest_run.status`，而
    // **状态在别处变化**时（另一个标签页、任务控制页、运维容器里取消了 run）本客户端
    // 没有任何对账时机——5 分钟 staleTime 内它会一直挂着过期的「待审核」。用户实测撞到过：
    // run 早已 cancelled，侧栏仍显示待审核。切窗口回来是最自然的对账点，且 staleTime
    // 仍拦得住频繁请求（不是每次聚焦都打）。
    refetchOnWindowFocus: true,
    // 只有 enabled 为 true 且已登录时才发起请求
    enabled,
  })
}

// 获取单个会话详情的 Query Hook —— 已删除（零消费者）。
// 会话恢复实际走 useSessionRestore 的 getThread() 直取 + chatStore 持久化，
// 此 Query 与该路径构成双缓存；如需 Query 化恢复路径，以 git 历史恢复此实现。

// 删除会话的 Mutation Hook
export function useDeleteThreadMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (threadId: string) => {
      await deleteThread(threadId)
      return threadId
    },
    onSuccess: (deletedId) => {
      // 成功删除后，重新获取列表
      queryClient.invalidateQueries({ queryKey: chatHistoryKeys.lists() })
      // 同时移除单个会话的缓存
      queryClient.removeQueries({ queryKey: chatHistoryKeys.detail(deletedId) })
      logger.debug('[useDeleteThreadMutation] Deleted and invalidated cache:', deletedId)
    },
    onError: (error) => {
      logger.error('[useDeleteThreadMutation] Failed to delete thread:', error)
    },
  })
}

// 批量删除会话的 Mutation Hook

