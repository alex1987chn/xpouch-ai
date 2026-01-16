import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider, useNavigate } from 'react-router-dom'
import { I18nProvider } from './i18n'
import { ThemeProvider } from './hooks/useTheme'
import './index.css'

import Layout from './components/Layout'
import HomePage from './components/HomePage'
import ChatPage from './components/ChatPage'
import HistoryPage from './components/HistoryPage'
import KnowledgeBasePage from './components/KnowledgeBasePage'
import CreateAgentPage from './components/CreateAgentPage'
import { useChatStore } from './store/chatStore'
import { type ConversationHistory } from './utils/storage'

// 包装 HistoryPage 以适应 Router
const HistoryPageWrapper = () => {
  return <HistoryPageWithNavigation />
}

const HistoryPageWithNavigation = () => {
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

  const handleSave = (agent: any) => {
    addCustomAgent(agent)
    navigate('/') // 回到首页
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
        path: 'chat/:id',
        element: <ChatPage />
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
      }
    ]
  }
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>
    </I18nProvider>
  </StrictMode>,
)
