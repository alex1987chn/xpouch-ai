/**
 * 路由配置
 * 从 main.tsx 抽离，保持入口文件简洁
 */

import { lazy, Suspense, useState, useEffect } from 'react'
import { createBrowserRouter, useNavigate, Navigate, Outlet, useParams } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AppLayout from './components/AppLayout'
import AdminRoute from './components/AdminRoute'
import ErrorBoundary from './components/ErrorBoundary'
import { Toaster } from './components/ui/toaster'
import { useChatStore } from './store/chatStore'
import { useTaskStore } from './store/taskStore'
import { useExecutionStore } from './store/executionStore'
import { createCustomAgent, updateCustomAgent, getAllAgents } from './services/api'
import { normalizeAgentId } from '@/utils/agentUtils'
import { logger } from '@/utils/logger'

// 路由懒加载 - 代码分割优化
const UnifiedChatPage = lazy(() => import('./pages/chat/UnifiedChatPage'))
const HistoryPage = lazy(() => import('./pages/history/HistoryPage'))
const KnowledgeBasePage = lazy(() => import('./pages/knowledge/KnowledgeBasePage'))
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

// 包装 HistoryPage 以适应 Router
const HistoryPageWrapper = () => {
  const navigate = useNavigate()
  const setMessages = useChatStore(state => state.setMessages)
  const setCurrentConversationId = useChatStore(state => state.setCurrentConversationId)

  const handleSelectConversation = (conversation: any) => {
    // 🔥🔥🔥 Server-Driven UI: 导航前清空所有 Store（事件驱动）
    // 避免旧任务/执行状态阻止新会话加载
    setMessages([])
    setCurrentConversationId(null)
    useTaskStore.getState().clearTasks()
    useExecutionStore.getState().reset()

    // 从 conversation 对象中提取所需参数
    const conversationId = conversation.id
    const agentId = conversation.agent_id || 'default-chat'
    const normalizedAgentId = normalizeAgentId(agentId)

    // 所有对话都使用纯净 URL /chat/:id
    // 后端自动根据 thread_mode 决定是简单模式还是复杂模式
    // 只有自定义智能体（非系统默认助手）才需要在 URL 中携带 agentId
    if (normalizedAgentId &&
        normalizedAgentId !== 'sys-default-chat' &&
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

// 包装 CreateAgentPage
const CreateAgentPageWrapper = () => {
  const navigate = useNavigate()
  const { addCustomAgent, invalidateAgentsCache } = useChatStore()

  const handleSave = async (agent: any) => {
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
      // 使缓存失效，确保首页能获取到最新数据
      invalidateAgentsCache()
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
  const { setCustomAgents, invalidateAgentsCache } = useChatStore()
  const [agentData, setAgentData] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadAgent = async () => {
      if (!id) {
        navigate('/')
        return
      }
      try {
        const agents = await getAllAgents()
        const agent = agents.find((a: any) => a.id === id)
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
  }, [id, navigate])

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
      // 使缓存失效
      invalidateAgentsCache()
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
        path: 'knowledge',
        element: (
          <Suspense fallback={<LoadingFallback />}>
            <KnowledgeBasePage />
          </Suspense>
        )
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
            <Suspense fallback={<LoadingFallback />}>
              <ExpertAdminPage />
            </Suspense>
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
  }
])

// 创建 QueryClient 实例
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5分钟缓存
      refetchOnWindowFocus: false,
    },
  },
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
