/**
 * =============================
 * MCP Server Query Hooks
 * =============================
 *
 * 使用 React Query 管理 MCP 服务器数据
 *
 * [特性]
 * - useMCPServers: 获取服务器列表
 * - useCreateMCP: 创建服务器
 * - useToggleMCP: 切换激活状态（乐观更新）
 * - useDeleteMCP: 删除服务器
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getMCPServers,
  createMCPServer,
  updateMCPServer,
  deleteMCPServer,
  getMCPServerTools,
  type MCPServer,
  type MCPServerCreate,
  type MCPServerUpdate,
  type MCPTool
} from '@/services/mcp'
import { logger } from '@/utils/logger'

// ============================================================================
// Query Key 工厂函数
// ============================================================================

export const mcpKeys = {
  all: ['mcpServers'] as const,
  lists: () => [...mcpKeys.all, 'list'] as const,
  list: () => [...mcpKeys.lists()] as const,
  details: () => [...mcpKeys.all, 'detail'] as const,
  detail: (id: string) => [...mcpKeys.details(), id] as const,
  tools: (id: string) => [...mcpKeys.detail(id), 'tools'] as const,
}

// ============================================================================
// Query Hooks
// ============================================================================

/**
 * 获取 MCP 服务器列表
 */
export function useMCPServers(options: { enabled?: boolean } = {}) {
  const { enabled = true } = options

  return useQuery({
    queryKey: mcpKeys.list(),
    queryFn: async () => {
      try {
        const response = await getMCPServers()
        logger.debug('[useMCPServers] Fetched servers:', response.length)
        return response
      } catch (error) {
        logger.error('[useMCPServers] Failed to fetch servers:', error)
        throw error
      }
    },
    // MCP 服务器列表不常变化，设置较长的缓存时间
    staleTime: 5 * 60 * 1000,    // 5分钟内数据被视为新鲜
    gcTime: 10 * 60 * 1000,       // 缓存数据保留10分钟
    // 错误时重试：401 不重试，其他错误重试2次
    retry: (failureCount, error: any) => {
      if (error?.status === 401) return false
      return failureCount < 2
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    // 组件挂载时自动重新获取
    refetchOnMount: 'always',
    // 窗口重新获得焦点时不自动刷新（避免打扰用户）
    refetchOnWindowFocus: false,
    enabled,
  })
}

// ============================================================================
// Mutation Hooks
// ============================================================================

/**
 * 创建 MCP 服务器的 Mutation
 */
export function useCreateMCP() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: MCPServerCreate) => {
      const server = await createMCPServer(data)
      return server
    },
    onSuccess: (newServer) => {
      // 成功创建后，刷新列表
      queryClient.invalidateQueries({ queryKey: mcpKeys.lists() })
      logger.debug('[useCreateMCP] Created and invalidated cache:', newServer.id)
    },
    onError: (error) => {
      logger.error('[useCreateMCP] Failed to create server:', error)
    },
  })
}

/**
 * 切换 MCP 服务器激活状态的 Mutation（乐观更新）
 * 
 * 特点：
 * - onMutate: 立即更新 UI，提供即时反馈
 * - onError: 失败时回滚到之前的状态
 * - onSettled: 最终刷新确保同步
 */
export function useToggleMCP() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const server = await updateMCPServer(id, { is_active })
      return server
    },
    
    // 🔥 乐观更新：请求发出前立即更新缓存
    onMutate: async ({ id, is_active }) => {
      // 取消正在进行的重新获取
      await queryClient.cancelQueries({ queryKey: mcpKeys.lists() })
      
      // 快照当前数据
      const previousServers = queryClient.getQueryData<MCPServer[]>(mcpKeys.list())
      
      // 乐观更新：立即修改缓存中的状态
      if (previousServers) {
        queryClient.setQueryData<MCPServer[]>(
          mcpKeys.list(),
          previousServers.map(server =>
            server.id === id ? { ...server, is_active } : server
          )
        )
      }
      
      // 返回快照用于回滚
      return { previousServers }
    },
    
    // 错误时回滚
    onError: (error, variables, context) => {
      logger.error('[useToggleMCP] Failed to toggle server:', error)
      
      // 回滚到之前的状态
      if (context?.previousServers) {
        queryClient.setQueryData(mcpKeys.list(), context.previousServers)
      }
    },
    
    // 无论成功失败，最终刷新确保状态同步
    onSettled: (data, error, variables) => {
      queryClient.invalidateQueries({ queryKey: mcpKeys.lists() })
      logger.debug('[useToggleMCP] Settled, cache invalidated')
    },
  })
}

/**
 * 删除 MCP 服务器的 Mutation
 */
export function useDeleteMCP() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      await deleteMCPServer(id)
      return id
    },
    onSuccess: (deletedId) => {
      // 成功删除后，刷新列表
      queryClient.invalidateQueries({ queryKey: mcpKeys.lists() })
      logger.debug('[useDeleteMCP] Deleted and invalidated cache:', deletedId)
    },
    onError: (error) => {
      logger.error('[useDeleteMCP] Failed to delete server:', error)
    },
  })
}

/**
 * 获取 MCP 服务器工具列表
 */
export function useMCPServerTools(serverId: string, options: { enabled?: boolean } = {}) {
  const { enabled = true } = options

  return useQuery({
    queryKey: mcpKeys.tools(serverId),
    queryFn: async () => {
      try {
        const tools = await getMCPServerTools(serverId)
        logger.debug('[useMCPServerTools] Fetched tools:', tools.length)
        return tools
      } catch (error) {
        logger.error('[useMCPServerTools] Failed to fetch tools:', error)
        throw error
      }
    },
    // 工具列表缓存 1 分钟
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    // 失败不重试（可能是服务器未连接）
    retry: false,
    enabled: enabled && !!serverId,
  })
}
