/**
 * 会话管理 Hook
 * 负责加载历史会话、删除会话等功能
 */

import { useCallback } from 'react'
import { deleteConversation as apiDeleteConversation } from '@/services/chat'
import { errorHandler } from '@/utils/logger'

import {
  useMessages,
  useCurrentConversationId,
  useChatActions,
} from '@/hooks/useChatSelectors'
/**
 * Conversation management Hook
 */
export function useConversation() {

  const messages = useMessages()
  const currentThreadId = useCurrentConversationId()
  
  // Actions
  const { 
    setMessages, 
    setCurrentConversationId, 
  } = useChatActions()

  /**
   * Delete conversation
   */
  const deleteConversation = useCallback(async (threadId: string) => {
    try {
      await apiDeleteConversation(threadId)

      if (currentThreadId === threadId) {
        setMessages([])
        setCurrentConversationId(null)
      }
    } catch (error) {
      errorHandler.handle(error, 'deleteConversation')
    }
  }, [currentThreadId, setMessages, setCurrentConversationId])

  return {
    messages,
    deleteConversation,
    currentConversationId: currentThreadId,
  }
}
