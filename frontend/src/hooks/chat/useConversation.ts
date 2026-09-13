/**
 * 会话管理 Hook
 * 负责加载历史会话、删除会话等功能
 */

import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { deleteConversation as apiDeleteConversation } from '@/services/chat'
import { chatHistoryKeys } from '@/hooks/queries/useChatHistoryQuery'
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
  const queryClient = useQueryClient()
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

      // 失效会话列表缓存——否则左栏 SessionStrata 删完仍残留该会话
      queryClient.invalidateQueries({ queryKey: chatHistoryKeys.lists() })
      queryClient.removeQueries({ queryKey: chatHistoryKeys.detail(threadId) })

      if (currentThreadId === threadId) {
        setMessages([])
        setCurrentConversationId(null)
      }
    } catch (error) {
      errorHandler.handle(error, 'deleteConversation')
    }
  }, [queryClient, currentThreadId, setMessages, setCurrentConversationId])

  return {
    messages,
    deleteConversation,
    currentConversationId: currentThreadId,
  }
}
