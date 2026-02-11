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

      const isPageRefresh = currentId === targetConversationId && store.messages.length > 0
      
      debug('Starting to load conversation:', targetConversationId, 'Current conversation:', currentId, 'Is page refresh:', isPageRefresh)

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
        setCurrentConversationId(targetConversationId)
        
        if (conversation.messages && conversation.messages.length > store.messages.length) {
          setMessages(conversation.messages)
        }
      }

      if (conversation.agent_id) {
        setSelectedAgentId(normalizeAgentId(conversation.agent_id))
      }

      clearTasks()

      if (conversation.task_session) {
        restoreFromSession(conversation.task_session, conversation.task_session.sub_tasks || [])
      }

      return conversation
    } catch (error: any) {
      // 🔥 修复：如果前端有消息但后端返回 404，可能是新会话创建过程中的竞态
      // 这种情况下静默处理，避免显示错误
      const store = useChatStore.getState()
      if (error?.status === 404 && store.messages.length > 0 && !store.messages.some(m => m.role === 'assistant' && m.content?.length > 0)) {
        debug('Conversation not found on backend but has pending messages, may be race condition during creation')
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
