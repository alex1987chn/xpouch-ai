/**
 * =============================
 * Chat History Query Hook
 * =============================
 *
 * 使用 React Query 管理聊天历史记录数据获取
 * 替代传统的 useEffect + useState 模式
 *
 * [优势]
 * 1. 自动缓存：避免重复请求
 * 2. 后台刷新：staleTime 过期后自动重新获取
 * 3. 错误重试：内置指数退避重试机制
 * 4. 乐观更新：支持乐观更新 UI
 *
 * [配置]
 * - staleTime: 5分钟，避免频繁请求
 * - gcTime: 10分钟，缓存数据保留时间
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getConversations, deleteConversation, type Conversation } from '@/services/chat'
import { logger } from '@/utils/logger'

// Query Key 工厂函数 - 统一管理中心化 Query Keys
export const chatHistoryKeys = {
  all: ['chatHistory'] as const,
  lists: () => [...chatHistoryKeys.all, 'list'] as const,
  list: (filters: { search?: string; limit?: number } = {}) =>
    [...chatHistoryKeys.lists(), filters] as const,
  details: () => [...chatHistoryKeys.all, 'detail'] as const,
  detail: (id: string) => [...chatHistoryKeys.details(), id] as const,
}

// 获取历史记录列表的 Query Hook
export function useChatHistoryQuery(options: { limit?: number; enabled?: boolean } = {}) {
  const { limit, enabled = true } = options

  return useQuery({
    queryKey: chatHistoryKeys.list({ limit }),
    queryFn: async () => {
      try {
        const conversations = await getConversations()
        logger.debug('[useChatHistoryQuery] Fetched conversations:', conversations.length)
        return conversations
      } catch (error) {
        logger.error('[useChatHistoryQuery] Failed to fetch conversations:', error)
        throw error
      }
    },
    // 5分钟内数据被视为新鲜，不会重新请求
    staleTime: 5 * 60 * 1000,
    // 缓存数据保留10分钟
    gcTime: 10 * 60 * 1000,
    // 错误时重试3次
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    // 组件挂载时如果数据是 stale 的，自动重新获取
    refetchOnMount: 'always',
    // 窗口重新获得焦点时不自动刷新（避免打扰用户）
    refetchOnWindowFocus: false,
    enabled,
  })
}

// 获取单个会话详情的 Query Hook
export function useChatSessionQuery(conversationId: string | null) {
  return useQuery({
    queryKey: chatHistoryKeys.detail(conversationId || ''),
    queryFn: async () => {
      if (!conversationId) {
        throw new Error('Conversation ID is required')
      }
      try {
        // 这里假设有一个获取单个会话详情的 API
        // 目前通过列表 API 获取完整详情，后续可以优化为独立 API
        const conversations = await getConversations()
        const conversation = conversations.find(c => c.id === conversationId)
        if (!conversation) {
          throw new Error(`Conversation ${conversationId} not found`)
        }
        return conversation
      } catch (error) {
        logger.error('[useChatSessionQuery] Failed to fetch conversation:', error)
        throw error
      }
    },
    // 只在有 conversationId 时启用
    enabled: !!conversationId,
    staleTime: 2 * 60 * 1000, // 2分钟
    gcTime: 5 * 60 * 1000, // 5分钟
    retry: 2,
  })
}

// 删除会话的 Mutation Hook
export function useDeleteConversationMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (conversationId: string) => {
      await deleteConversation(conversationId)
      return conversationId
    },
    onSuccess: (deletedId) => {
      // 成功删除后，重新获取列表
      queryClient.invalidateQueries({ queryKey: chatHistoryKeys.lists() })
      // 同时移除单个会话的缓存
      queryClient.removeQueries({ queryKey: chatHistoryKeys.detail(deletedId) })
      logger.debug('[useDeleteConversationMutation] Deleted and invalidated cache:', deletedId)
    },
    onError: (error) => {
      logger.error('[useDeleteConversationMutation] Failed to delete conversation:', error)
    },
  })
}

// 获取最近会话的 Hook（用于侧边栏）
export function useRecentConversationsQuery(limit: number = 20) {
  const { data, isLoading, error } = useChatHistoryQuery()

  // 在客户端对数据进行排序和切片
  const recentConversations = data
    ? [...data]
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        .slice(0, limit)
    : []

  return {
    data: recentConversations,
    isLoading,
    error,
    // 原始数据也暴露出来，以备需要
    allConversations: data,
  }
}
