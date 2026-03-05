/**
 * 会话管理 Hook
 * 负责加载历史会话、删除会话等功能
 */

import { useCallback } from 'react'
import { getConversation, deleteConversation as apiDeleteConversation } from '@/services/chat'
import { normalizeAgentId } from '@/utils/agentUtils'
import { errorHandler, logger } from '@/utils/logger'
import type { SubTask } from '@/types'

import {
  useMessages,
  useCurrentConversationId,
  useChatActions,
} from '@/hooks/useChatSelectors'
import { useTaskActions } from '@/hooks/useTaskSelectors'
import { useChatStore } from '@/store/chatStore'
import { useTaskStore } from '@/store/taskStore'


/**
 * Conversation management Hook
 */
export function useConversation() {
  function isStatusError(error: unknown): error is { status?: number } {
    return typeof error === 'object' && error !== null && 'status' in error
  }

  const messages = useMessages()
  const currentConversationId = useCurrentConversationId()
  
  // Actions
  const { 
    setMessages, 
    setCurrentConversationId, 
    setSelectedAgentId 
  } = useChatActions()
  
  const {
    restoreFromSession,
    resetTasks,
    setMode,
    setIsInitialized,
  } = useTaskActions()

  /**
   * Delete conversation
   */
  const deleteConversation = useCallback(async (conversationId: string) => {
    try {
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
    deleteConversation,
    currentConversationId,
  }
}
