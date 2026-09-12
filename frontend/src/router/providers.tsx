/**
 * 路由 Provider 配置
 * 
 * 包含：
 * - QueryClient 配置（缓存、错误处理）
 * - 全局 401 错误处理
 * - AppProviders 包装组件
 */

import { useEffect, useRef } from 'react'
import { QueryClient, QueryClientProvider, QueryCache, useQueryClient } from '@tanstack/react-query'
import { useUserStore } from '@/store/userStore'
import { useChatStore } from '@/store/chatStore'
import { DEFAULT_CACHE_CONFIG } from '@/config/query'
import { showLoginDialog } from '@/utils/authUtils'
import ErrorBoundary from '@/components/ErrorBoundary'
import { Toaster } from '@/components/ui/toaster'

// 🔐 全局 401 错误处理 - 触发登录弹窗
interface ApiError {
  status?: number
  message?: string
}

const handleGlobalError = (error: ApiError) => {
  if (error?.status === 401) {
    showLoginDialog()
  }
}

// 创建 QueryClient 实例
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: DEFAULT_CACHE_CONFIG.staleTime,
      refetchOnWindowFocus: false,
      retry: (failureCount, error: unknown) => {
        // 401 不重试
        const apiError = error as ApiError
        if (apiError?.status === 401) return false
        return failureCount < 2
      },
    },
    mutations: {
      onError: handleGlobalError,
    },
  },
  queryCache: new QueryCache({
    onError: handleGlobalError,
  }),
})

/**
 * UserIdentitySync - 登录/登出/换号时清空 react-query 缓存与会话选中态。
 * 否则上一身份（如管理员）的接口缓存会带到新身份：轻则展示过期数据，
 * 重则管理端点 403 报错，刷新页面才恢复。
 */
function UserIdentitySync() {
  const userId = useUserStore(s => s.user?.id)
  const queryClient = useQueryClient()
  const prevRef = useRef<string | undefined>(userId)

  useEffect(() => {
    if (prevRef.current !== userId) {
      queryClient.clear()
      useChatStore.setState({ currentConversationId: null, messages: [] })
      prevRef.current = userId
    }
  }, [userId, queryClient])

  return null
}

// 导出Provider包装组件（供main.tsx使用）
export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <UserIdentitySync />
      <ErrorBoundary>
        {children}
        <Toaster />
      </ErrorBoundary>
    </QueryClientProvider>
  )
}

// 导出 queryClient 供测试使用
export { queryClient }
