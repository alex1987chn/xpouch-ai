/**
 * 会话管理 Hook
 * 负责加载历史会话、删除会话等功能
 */

import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { deleteThread as apiDeleteThread } from '@/services/chat'
import { chatHistoryKeys } from '@/hooks/queries/useChatHistoryQuery'
import { errorHandler } from '@/utils/logger'

import {
  useMessages,
  useCurrentThreadId,
  useChatActions,
} from '@/hooks/useChatSelectors'
/**
 * Thread management Hook
 */
export function useThread() {
  const queryClient = useQueryClient()
  const messages = useMessages()
  const currentThreadId = useCurrentThreadId()

  // Actions
  const {
    setMessages,
    setCurrentThreadId,
  } = useChatActions()

  /**
   * Delete thread
   */
  const deleteThread = useCallback(async (threadId: string) => {
    try {
      await apiDeleteThread(threadId)

      // 失效会话列表缓存——否则左栏 SessionStrata 删完仍残留该会话
      queryClient.invalidateQueries({ queryKey: chatHistoryKeys.lists() })
      queryClient.removeQueries({ queryKey: chatHistoryKeys.detail(threadId) })

      if (currentThreadId === threadId) {
        setMessages([])
        setCurrentThreadId(null)
      }
    } catch (error) {
      errorHandler.handle(error, 'deleteThread')
    }
  }, [queryClient, currentThreadId, setMessages, setCurrentThreadId])

  return {
    messages,
    deleteThread,
    currentThreadId: currentThreadId,
  }
}
