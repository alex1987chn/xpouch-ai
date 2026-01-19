import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider, useNavigate, Navigate } from 'react-router-dom'
import { I18nProvider } from './i18n'
import { ThemeProvider } from './hooks/useTheme'
import './index.css'

import Layout from './components/Layout'
import HomePage from './components/HomePage'
import CanvasChatPage from './components/CanvasChatPage'
import HistoryPage from './components/HistoryPage'
import KnowledgeBasePage from './components/KnowledgeBasePage'
import CreateAgentPage from './components/CreateAgentPage'
import ErrorBoundary from './components/ErrorBoundary'
import { useChatStore } from './store/chatStore'
import { type ConversationHistory } from './utils/storage'
import { createCustomAgent } from './services/api'

// 包装 HistoryPage 以适应 Router
const HistoryPageWrapper = () => {
  const navigate = useNavigate()

  const handleConversationClick = (id: string) => {
    navigate(`/chat/${id}`)
  }

  const handleSelectConversation = (conversation: ConversationHistory) => {
    navigate(`/chat/${conversation.id}`)
  }

  return (
    <HistoryPage
      onConversationClick={handleConversationClick}
      onSelectConversation={handleSelectConversation}
    />
  )
}

// 包装 CreateAgentPage
const CreateAgentPageWrapper = () => {
  const navigate = useNavigate()
  const { addCustomAgent } = useChatStore()

  const handleSave = async (agent: any) => {
    try {
      // 使用统一的 API 调用
      const savedAgent = await createCustomAgent({
        name: agent.name,
        description: agent.description,
        systemPrompt: agent.systemPrompt,
        category: agent.category,
        modelId: agent.modelId
      })

      // 同时更新前端状态（添加 UI 所需的属性）
      const agentWithUI = {
        ...savedAgent,
        icon: agent.icon,
        color: agent.color
      }

      addCustomAgent(agentWithUI)
      navigate('/') // 回到首页
    } catch (error) {
      console.error('保存智能体失败:', error)
      alert('保存失败，请稍后重试')
    }
  }

  return (
    <CreateAgentPage
      onBack={() => navigate('/')}
      onSave={handleSave}
    />
  )
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      {
        index: true,
        element: <HomePage />
      },
      {
        path: 'history',
        element: <HistoryPageWrapper />
      },
      {
        path: 'knowledge',
        element: <KnowledgeBasePage />
      },
      {
        path: 'create-agent',
        element: <CreateAgentPageWrapper />
      },
      {
        path: '*',
        element: <Navigate to="/" replace />
      }
    ]
  },
  {
    path: '/chat/:id',
    element: <CanvasChatPage />
  }
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <I18nProvider>
        <ThemeProvider>
          <RouterProvider router={router} />
        </ThemeProvider>
      </I18nProvider>
    </ErrorBoundary>
  </StrictMode>,
)
