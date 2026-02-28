/**
 * 路由配置
 * 从 main.tsx 抽离，保持入口文件简洁
 */

import { lazy, Suspense, useState, useEffect, useCallback } from 'react'
import { createBrowserRouter, useNavigate, Navigate, Outlet, useParams } from 'react-router-dom'
import { QueryClient, QueryClientProvider, QueryCache, useQueryClient } from '@tanstack/react-query'
import { DEFAULT_CACHE_CONFIG } from '@/config/query'
import AppLayout from './components/AppLayout'
import AdminRoute from './components/AdminRoute'
import ErrorBoundary from './components/ErrorBoundary'
import { SuspenseWithErrorBoundary } from './components/SuspenseWithErrorBoundary'
import { Toaster } from './components/ui/toaster'
import { useChatStore } from './store/chatStore'
import { useTaskStore } from './store/taskStore'
import { useUserStore } from './store/userStore'
import { createCustomAgent, updateCustomAgent, getAllAgents } from './services/api'
import { normalizeAgentId } from '@/utils/agentUtils'
import { logger } from '@/utils/logger'
import { SYSTEM_AGENTS } from '@/constants/agents'
import { agentsKeys } from '@/hooks/queries'
import type { Conversation, Agent } from '@/types'
import type { AgentDisplay, CreateAgentRequest } from '@/services/agent'

// 路由懒加载 - 代码分割优化
const UnifiedChatPage = lazy(() => import('./pages/chat/UnifiedChatPage'))
const HistoryPage = lazy(() => import('./pages/history/HistoryPage'))
const LibraryPage = lazy(() => import('./pages/library/LibraryPage'))
const CreateAgentPage = lazy(() => import('./pages/agent/CreateAgentPage'))
const ExpertAdminPage = lazy(() => import('./pages/admin/ExpertAdminPage'))

// 同步导入（轻量组件）
import HomePage from './pages/home/HomePage'

// 加载中状态组件
function LoadingFallback() {
  return (
    <div className="h-screen w-full flex items-center justify-center font-mono text-sm text-secondary">
      <div className="flex items-center gap-3">
        <div className="w-2 h-2 bg-[var(--accent)] animate-pulse" />
        <span>INITIALIZING_SYSTEM...</span>
      </div>
    </div>
  )
}

// 🔐 需要登录的路由守卫 Hook
const useRequireAuth = () => {
  const navigate = useNavigate()
  const isAuthenticated = useUserStore(state => state.isAuthenticated)
  const setLoginDialogOpen = useTaskStore(state => state.setLoginDialogOpen)
  
  useEffect(() => {
    if (!isAuthenticated) {
      setLoginDialogOpen(true)
      navigate('/', { replace: true })
    }
  }, [isAuthenticated, navigate, setLoginDialogOpen])
  
  return isAuthenticated
}

// 包装 HistoryPage 以适应 Router
const HistoryPageWrapper = () => {
  const navigate = useNavigate()
  const setMessages = useChatStore(state => state.setMessages)
  const setCurrentConversationId = useChatStore(state => state.setCurrentConversationId)
  
  // 🔐 检查登录状态
  const isAuthenticated = useRequireAuth()
  
  // 未登录时显示 loading（会被重定向）
  if (!isAuthenticated) {
    return <LoadingFallback />
  }

  const handleSelectConversation = (conversation: Conversation) => {
    // 🔥 Server-Driven UI: 导航前重置当前状态
    // 目标页面会通过 API 或 localStorage 恢复新会话的数据
    setMessages([])
    setCurrentConversationId(null)
    // 🔥 重置 taskStore 所有状态（包括 selectedTaskId）
    // 使用 force=true 强制重置，避免运行中任务的保护逻辑
    useTaskStore.getState().resetAll(true)

    // 从 conversation 对象中提取所需参数
    const conversationId = conversation.id
    const agentId = conversation.agent_id || 'default-chat'
    const normalizedAgentId = normalizeAgentId(agentId)

    // 所有对话都使用纯净 URL /chat/:id
    // URL 携带 agentId，作为页面状态的唯一真相源 (SDUI)
    // 只有自定义智能体（非系统默认助手）才需要在 URL 中携带 agentId
    if (normalizedAgentId &&
        normalizedAgentId !== SYSTEM_AGENTS.DEFAULT_CHAT &&
        normalizedAgentId !== 'default-chat' &&
        !normalizedAgentId.startsWith('sys-')) {
      // 自定义智能体：需要携带 agentId
      const searchParams = new URLSearchParams()
      searchParams.set('agentId', normalizedAgentId)
      navigate(`/chat/${conversationId}?${searchParams.toString()}`)
    } else {
      // 系统默认助手：纯净 URL，后端自动处理模式
      navigate(`/chat/${conversationId}`)
    }
  }

  return (
    <Suspense fallback={<LoadingFallback />}>
      <HistoryPage
        onSelectConversation={handleSelectConversation}
      />
    </Suspense>
  )
}

// 🔐 包装 LibraryPage（需要登录）
const LibraryPageWrapper = () => {
  const isAuthenticated = useRequireAuth()
  
  if (!isAuthenticated) {
    return <LoadingFallback />
  }
  
  return (
    <SuspenseWithErrorBoundary fallback={<LoadingFallback />}>
      <LibraryPage />
    </SuspenseWithErrorBoundary>
  )
}

// 包装 CreateAgentPage
const CreateAgentPageWrapper = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const addCustomAgent = useChatStore(state => state.addCustomAgent)

  const handleSave = async (agent: CreateAgentRequest & { icon: string; color?: string }) => {
    try {
      const savedAgent = await createCustomAgent({
        name: agent.name,
        description: agent.description,
        systemPrompt: agent.systemPrompt,
        category: agent.category,
        modelId: agent.modelId
      })

      const agentWithUI = {
        ...savedAgent,
        icon: agent.icon,
        color: agent.color
      }

      addCustomAgent(agentWithUI)
      
      // 🔥 使用 React Query 缓存失效，确保首页能获取到最新数据
      queryClient.invalidateQueries({ queryKey: agentsKeys.lists() })
      
      // 导航到首页并切换到"我的智能体"标签
      navigate('/', { state: { agentTab: 'my' } })
    } catch (error) {
      logger.error('保存智能体失败:', error)
      alert('保存失败，请稍后重试')
    }
  }

  return (
    <Suspense fallback={<LoadingFallback />}>
      <CreateAgentPage
        onBack={() => navigate('/')}
        onSave={handleSave}
      />
    </Suspense>
  )
}

// 包装 EditAgentPage
const EditAgentPageWrapper = () => {
  const navigate = useNavigate()
  const { id } = useParams()
  const queryClient = useQueryClient()
  const setCustomAgents = useChatStore(state => state.setCustomAgents)
  const isAuthenticated = useUserStore(state => state.isAuthenticated)
  const [agentData, setAgentData] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // 未登录时重定向到首页
    if (!isAuthenticated) {
      navigate('/')
      return
    }
    
    const loadAgent = async () => {
      if (!id) {
        navigate('/')
        return
      }
      try {
        const agents = await getAllAgents()
        const agent = agents.find((a: AgentDisplay) => a.id === id)
        if (!agent) {
          logger.error('智能体不存在:', id)
          navigate('/')
          return
        }
        setAgentData({
          id: agent.id,
          name: agent.name,
          description: agent.description || '',
          systemPrompt: agent.system_prompt || '',
          category: agent.category || '综合',
          modelId: agent.model_id || 'deepseek-chat'
        })
      } catch (error) {
        logger.error('加载智能体失败:', error)
        navigate('/')
      } finally {
        setIsLoading(false)
      }
    }
    loadAgent()
  }, [id, navigate, isAuthenticated])

  const handleSave = async (agent: any) => {
    if (!id) return
    try {
      const updatedAgent = await updateCustomAgent(id, {
        name: agent.name,
        description: agent.description,
        systemPrompt: agent.systemPrompt,
        category: agent.category,
        modelId: agent.modelId
      })

      // 更新本地状态
      setCustomAgents(prev =>
        prev.map(a =>
          a.id === id
            ? { ...a, ...updatedAgent }
            : a
        )
      )
      
      // 🔥 使用 React Query 缓存失效
      queryClient.invalidateQueries({ queryKey: agentsKeys.lists() })
      
      // 导航回首页
      navigate('/', { state: { agentTab: 'my' } })
    } catch (error) {
      logger.error('更新智能体失败:', error)
      alert('更新失败，请稍后重试')
    }
  }

  if (isLoading) {
    return <LoadingFallback />
  }

  return (
    <Suspense fallback={<LoadingFallback />}>
      {/* 使用 key 强制组件在 id 变化时重新挂载，避免 useEffect 同步 Props 反模式 */}
      <CreateAgentPage
        key={`edit-agent-${id}`}
        onBack={() => navigate('/')}
        onSave={handleSave}
        initialData={agentData}
        isEditMode={true}
      />
    </Suspense>
  )
}

// 统一的聊天页面（支持简单和复杂模式）
const UnifiedChatPageWrapper = () => {
  const { id } = useParams()
  // 关键：使用 key 强制组件在 conversationId 变化时重新创建
  // 避免 React 复用组件实例导致状态混乱
  return (
    <Suspense fallback={<LoadingFallback />}>
      <UnifiedChatPage key={id || 'new'} />
    </Suspense>
  )
}

// 路由配置
export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout><Outlet /></AppLayout>,
    children: [
      {
        index: true,
        element: <HomePage />
      },
      {
        path: 'library',
        element: <LibraryPageWrapper />
      },
      {
        path: 'history',
        element: <HistoryPageWrapper />
      },
      {
        path: 'create-agent',
        element: <CreateAgentPageWrapper />
      },
      {
        path: 'edit-agent/:id',
        element: <EditAgentPageWrapper />
      },
      {
        path: 'admin/experts',
        element: (
          <AdminRoute>
            <SuspenseWithErrorBoundary fallback={<LoadingFallback />}>
              <ExpertAdminPage />
            </SuspenseWithErrorBoundary>
          </AdminRoute>
        )
      },
      {
        path: '*',
        element: <Navigate to="/" replace />
      }
    ]
  },
  {
    // 统一的聊天页面（支持简单和复杂模式）
    path: '/chat',
    element: <AppLayout hideMobileMenu={true}><UnifiedChatPageWrapper /></AppLayout>
  },
  {
    // 统一聊天页面的带ID版本（兼容历史记录跳转）
    path: '/chat/:id',
    element: <AppLayout hideMobileMenu={true}><UnifiedChatPageWrapper /></AppLayout>
  },
  {
    // 登录页面 - 暂时重定向到首页（登录弹窗在首页处理）
    path: '/login',
    element: <Navigate to="/" replace />
  }
])

// 🔐 全局 401 错误处理 - 触发登录弹窗
interface ApiError {
  status?: number
  message?: string
}

const handleGlobalError = (error: ApiError) => {
  if (error?.status === 401) {
    // 动态导入避免循环依赖
    import('@/store/taskStore').then(({ useTaskStore }) => {
      useTaskStore.getState().setLoginDialogOpen(true)
    })
  }
}

// 创建 QueryClient 实例
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: DEFAULT_CACHE_CONFIG.staleTime, // 使用统一缓存配置
      refetchOnWindowFocus: false,
      // 全局错误处理
      retry: (failureCount, error: unknown) => {
        // 401 不重试
        const apiError = error as ApiError
        if (apiError?.status === 401) return false
        return failureCount < 2
      },
    },
    mutations: {
      // Mutation 全局错误处理
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
