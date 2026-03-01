/**
 * 路由 Provider 配置
 * 
 * 包含：
 * - QueryClient 配置（缓存、错误处理）
 * - 全局 401 错误处理
 * - AppProviders 包装组件
 */

import { QueryClient, QueryClientProvider, QueryCache } from '@tanstack/react-query'
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

// 导出Provider包装组件（供main.tsx使用）
export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        {children}
        <Toaster />
      </ErrorBoundary>
    </QueryClientProvider>
  )
}

// 导出 queryClient 供测试使用
export { queryClient }
