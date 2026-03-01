/**
 * 会话管理 Hook
 * 负责加载历史会话、删除会话等功能
 */

import { useCallback } from 'react'
import { getConversation, deleteConversation as apiDeleteConversation } from '@/services/chat'
import { normalizeAgentId } from '@/utils/agentUtils'
import { errorHandler, logger } from '@/utils/logger'
import { formatTaskOutput } from '@/utils/formatters'
import type { Conversation } from '@/types'

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
    resetTasks,
    setMode,
    setIsInitialized,
  } = useTaskActions()

  /**
   * Load historical conversation
   */
  const loadConversation = useCallback(async (targetConversationId: string) => {
    try {
      const store = useChatStore.getState()
      const taskStore = useTaskStore.getState()
      const currentId = store.currentConversationId

      // 🔥🔥🔥 简化判断：检查是否需要重新加载
      const isSameConversation = currentId === targetConversationId
      const hasMessages = store.messages.length > 0
      
      // 🔥 如果已有 task 数据，跳过加载（保留 persist 恢复的数据）
      if (taskStore.tasks.size > 0) {
        logger.debug('已有 task 数据，跳过加载')
        return null
      }
      
      // 如果会话和消息都已加载，跳过
      if (isSameConversation && hasMessages) {
        logger.debug('会话已加载，跳过')
        return null
      }

      // 需要重新加载
      logger.debug('开始加载会话:', targetConversationId, '当前会话:', currentId)

      const conversation = await getConversation(targetConversationId)

      // 清空旧消息
      if (currentId !== targetConversationId) {
        setMessages([])
      }

      setCurrentConversationId(targetConversationId)

      // 设置消息
      if (conversation.messages && conversation.messages.length > 0) {
        setMessages(conversation.messages)
      } else {
        setMessages([])
      }

      // 设置 agent
      if (conversation.agent_id) {
        setSelectedAgentId(normalizeAgentId(conversation.agent_id))
      }

      // 智能恢复：比较 API 数据和本地数据
      const subTasks = conversation.task_session?.sub_tasks || []
      const apiArtifactCount = subTasks.reduce((sum: number, t: any) => 
        sum + (t.artifacts?.length || 0), 0)
      
      // 检查本地数据
      let localArtifactCount = 0
      try {
        const stored = localStorage.getItem('xpouch-task-store@2')
        if (stored) {
          const parsed = JSON.parse(stored)
          if (parsed.tasks && Array.isArray(parsed.tasks)) {
            localArtifactCount = parsed.tasks.reduce((sum: number, entry: any) => {
              const task = entry[1]
              return sum + (task?.artifacts?.length || 0)
            }, 0)
          }
        }
      } catch (e) {
        // ignore
      }
      
      // 如果 API 没有 artifacts 但本地有，保留本地数据
      if (apiArtifactCount === 0 && localArtifactCount > 0) {
        // 保留本地数据，跳过恢复
      } else {
        // 清空旧任务状态并恢复
        resetTasks(true)

        if (conversation.task_session) {
          restoreFromSession(conversation.task_session, subTasks)
          // 🔥 恢复成功后设置 UI 状态
          setMode('complex')
          setIsInitialized(true)
        }
      }

      return conversation
    } catch (error: any) {
      // 404 错误：会话不存在（可能是新会话还没在后端创建）
      if (error?.status === 404) {
        return null
      }
      
      errorHandler.handle(error, 'loadConversation')
      throw error
    }
  }, [
    setMessages,
    setCurrentConversationId,
    setSelectedAgentId,
    resetTasks,
    restoreFromSession,
    setMode,
    setIsInitialized
  ])

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
    loadConversation,
    deleteConversation,
    currentConversationId,
  }
}
