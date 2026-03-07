/**
 * HistoryPage 路由包装器
 * 
 * 职责：
 * - 登录认证守卫
 * - 会话状态重置
 * - URL 导航逻辑（SDUI）
 */

import { Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import { useChatStore } from '@/store/chatStore'
import { useTaskStore } from '@/store/taskStore'
import { normalizeAgentId } from '@/utils/agentUtils'
import { SYSTEM_AGENTS } from '@/constants/agents'
import { useRequireAuth } from '../hooks/useRequireAuth'
import { LoadingFallback } from '../components/LoadingFallback'
import type { Conversation } from '@/types'

// 懒加载页面组件
import { lazy } from 'react'
const HistoryPage = lazy(() => import('@/pages/history/HistoryPage'))

export function HistoryPageWrapper() {
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
    setMessages([])
    setCurrentConversationId(null)
    // 🔥 重置 taskStore 所有状态（包括 selectedTaskId）
    useTaskStore.getState().resetAll(true)

    // 从 conversation 对象中提取所需参数
    const threadId = conversation.id
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
      navigate(`/chat/${threadId}?${searchParams.toString()}`)
    } else {
      // 系统默认助手：纯净 URL，后端自动处理模式
      navigate(`/chat/${threadId}`)
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
