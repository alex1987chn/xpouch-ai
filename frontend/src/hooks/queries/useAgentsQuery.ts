/**
 * =============================
 * Agents Query Hook
 * =============================
 *
 * 使用 React Query 管理智能体数据获取
 *
 * [配置说明]
 * - staleTime: 30分钟，智能体列表不常变化
 * - gcTime: 60分钟，缓存保留时间较长
 * - refetchOnWindowFocus: false，避免打扰用户
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getAllAgents, deleteCustomAgent, type Agent } from '@/services/agent'
import { logger } from '@/utils/logger'
import { CACHE_TIMES } from '@/config/query'
import { chatHistoryKeys } from './useChatHistoryQuery'

// Query Key 工厂函数
export const agentsKeys = {
  all: ['agents'] as const,
  lists: () => [...agentsKeys.all, 'list'] as const,
  list: (filters: { includeDefault?: boolean } = {}) =>
    [...agentsKeys.lists(), filters] as const,
  details: () => [...agentsKeys.all, 'detail'] as const,
  detail: (id: string) => [...agentsKeys.details(), id] as const,
}

// 智能体类型（UI 层使用的格式）
export interface UIAgent {
  id: string
  name: string
  description: string
  icon: React.ReactNode
  systemPrompt: string
  category: string
  modelId: string
  isCustom: boolean
  is_builtin: boolean
}

// 获取所有智能体的 Query Hook
export function useAgentsQuery(options: { includeDefault?: boolean; enabled?: boolean } = {}) {
  const { includeDefault = true, enabled = true } = options

  return useQuery({
    queryKey: agentsKeys.list({ includeDefault }),
    queryFn: async () => {
      try {
        const response = await getAllAgents()
        logger.debug('[useAgentsQuery] Fetched agents:', response.length)
        return response
      } catch (error) {
        logger.error('[useAgentsQuery] Failed to fetch agents:', error)
        throw error
      }
    },
    // 智能体列表不常变化，使用较长缓存时间
    staleTime: CACHE_TIMES.AGENTS.staleTime,
    gcTime: CACHE_TIMES.AGENTS.gcTime,
    // 错误时重试：401 不重试，其他错误重试2次
    retry: (failureCount, error: any) => {
      // 401 未授权不 retry，避免无限循环
      if (error?.status === 401) return false
      return failureCount < 2
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    // 组件挂载时如果数据是 stale 的，自动重新获取
    refetchOnMount: 'always',
    // 窗口重新获得焦点时不自动刷新
    refetchOnWindowFocus: false,
    // 只有 enabled 为 true 时才发起请求
    enabled,
  })
}

// 获取自定义智能体的 Hook（过滤掉默认智能体）
export function useCustomAgentsQuery(options: { enabled?: boolean } = {}) {
  const { enabled = true } = options
  const { data, isLoading, error, refetch } = useAgentsQuery({ includeDefault: false, enabled })

  // 转换数据格式为 UI 层需要的格式
  const customAgents: UIAgent[] = data
    ? data
        .filter(agent => !agent.is_default)
        .map(agent => ({
          id: agent.id,
          name: agent.name,
          description: agent.description || '',
          icon: null, // 在组件层注入图标
          systemPrompt: agent.system_prompt || '',
          category: agent.category || '综合',
          modelId: agent.model_id || 'deepseek-chat',
          isCustom: true,
          is_builtin: false,
        }))
    : []

  return {
    data: customAgents,
    isLoading,
    error,
    refetch,
    rawData: data,
  }
}

// 删除自定义智能体的 Mutation Hook
export function useDeleteAgentMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (agentId: string) => {
      await deleteCustomAgent(agentId)
      return agentId
    },
    onSuccess: (deletedId) => {
      // 成功删除后，使 agents 列表缓存失效
      queryClient.invalidateQueries({ queryKey: agentsKeys.lists() })
      // 同时可能影响会话列表（因为会话关联智能体）
      queryClient.invalidateQueries({ queryKey: chatHistoryKeys.lists() })
      logger.debug('[useDeleteAgentMutation] Deleted and invalidated cache:', deletedId)
    },
    onError: (error) => {
      logger.error('[useDeleteAgentMutation] Failed to delete agent:', error)
    },
  })
}
