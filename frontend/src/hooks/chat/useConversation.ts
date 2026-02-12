/**
 * 会话管理 Hook
 * 负责加载历史会话、删除会话等功能
 * 
 * v3.1.0 性能优化：使用 Zustand Selectors 避免不必要的重渲染
 */

import { useCallback } from 'react'
import { getConversation, deleteConversation as apiDeleteConversation } from '@/services/chat'
import { normalizeAgentId } from '@/utils/agentUtils'
import { errorHandler } from '@/utils/logger'
import type { Conversation } from '@/types'

// Performance Optimized Selectors (v3.1.0)
import {
  useMessages,
  useCurrentConversationId,
  useChatActions,
} from '@/hooks/useChatSelectors'
import { useTaskActions } from '@/hooks/useTaskSelectors'
import { useChatStore } from '@/store/chatStore'

// Helper function: Convert backend JSON output to Markdown string
const formatTaskOutput = (outputResult: any): string => {
  if (!outputResult) return ''

  if (typeof outputResult === 'string') return outputResult

  let formattedText = outputResult.content || ''

  if (outputResult.source && Array.isArray(outputResult.source) && outputResult.source.length > 0) {
    formattedText += '\n\n---\n**参考来源：**\n'
    outputResult.source.forEach((src: any, index: number) => {
      const title = src.title || '未知来源'
      const url = src.url || '#'
      formattedText += `> ${index + 1}. [${title}](${url})\n`
    })
  }
  else if (outputResult.sources) {
    formattedText += '\n\n**参考资料:** ' + JSON.stringify(outputResult.sources)
  }

  return formattedText
}

// Dev environment check
const DEBUG = import.meta.env.VITE_DEBUG_MODE === 'true'

// Unified debug log function
const debug = DEBUG
  ? (...args: unknown[]) => console.log('[useConversation]', ...args)
  : () => {}

/**
 * Conversation management Hook
 */
export function useConversation() {
  // Performance Optimized Selectors (v3.1.0)
  const messages = useMessages()
  const currentConversationId = useCurrentConversationId()
  
  // Actions
  const { 
    setMessages, 
    setCurrentConversationId, 
    setSelectedAgentId 
  } = useChatActions()
  
  const { 
    initializePlan,
    restoreFromSession,
    clearTasks,
  } = useTaskActions()

  /**
   * Load historical conversation
   */
  const loadConversation = useCallback(async (targetConversationId: string) => {
    try {
      const store = useChatStore.getState()
      const currentId = store.currentConversationId

      // 🔥🔥🔥 改进：判断是否正在显示当前会话（避免执行完成后误判为页面刷新）
      const isCurrentlyDisplaying = currentId === targetConversationId && store.messages.length > 0
      // 🔥🔥🔥 真正的页面刷新：messages 来自 localStorage 恢复或为空
      const isPageRefresh = isCurrentlyDisplaying && !store.messages.some(m => m.role === 'assistant' && m.content && m.content.length > 10)
      
      debug('Starting to load conversation:', targetConversationId, 'Current conversation:', currentId, 'Is page refresh:', isPageRefresh, 'Is displaying:', isCurrentlyDisplaying)

      const conversation = await getConversation(targetConversationId)

      if (!isPageRefresh) {
        if (currentId !== targetConversationId) {
          debug('Clearing old messages, preparing to load new conversation')
          setMessages([])
        }

        setCurrentConversationId(targetConversationId)

        if (conversation.messages && conversation.messages.length > 0) {
          setMessages(conversation.messages)
          debug('Setting new conversation messages:', conversation.messages.length, 'items')
        } else {
          setMessages([])
          debug('New conversation has no messages, clearing message list')
        }
      } else {
        // 🔥🔥🔥 页面刷新时，强制重新加载消息（确保从数据库获取完整内容）
        setCurrentConversationId(targetConversationId)
        
        // 始终使用数据库的最新消息，避免本地累积的流式内容不完整
        if (conversation.messages && conversation.messages.length > 0) {
          debug('Page refresh: Loading complete messages from database:', conversation.messages.length, 'items')
          setMessages(conversation.messages)
        }
      }

      if (conversation.agent_id) {
        setSelectedAgentId(normalizeAgentId(conversation.agent_id))
      }

      // 🔥 强制清空任务状态（包括持久化的 runningTaskIds）
      // 避免旧的持久化状态阻止新会话加载
      clearTasks(true)

      if (conversation.task_session) {
        debug('Restoring task session:', conversation.task_session.id, 'sub_tasks:', conversation.task_session.sub_tasks?.length)
        restoreFromSession(conversation.task_session, conversation.task_session.sub_tasks || [])
      }

      return conversation
    } catch (error: any) {
      // 404 错误：会话不存在（可能是新会话还没在后端创建）
      // 这种情况下静默处理，不显示错误日志
      if (error?.status === 404) {
        debug('Conversation not found on backend, may be new conversation')
        return null
      }
      
      errorHandler.handle(error, 'loadConversation')
      throw error
    }
  }, [
    setMessages,
    setCurrentConversationId,
    setSelectedAgentId,
    clearTasks,
    restoreFromSession
  ])

  /**
   * Delete conversation
   */
  const deleteConversation = useCallback(async (conversationId: string) => {
    try {
      debug('Deleting conversation:', conversationId)
      await apiDeleteConversation(conversationId)

      if (currentConversationId === conversationId) {
        setMessages([])
        setCurrentConversationId(null)
      }
    } catch (error) {
      errorHandler.handle(error, 'deleteConversation')
    }
  }, [currentConversationId, setMessages, setCurrentConversationId])

  return {
    messages,
    loadConversation,
    deleteConversation,
    currentConversationId,
  }
}
