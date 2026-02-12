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
      const taskStore = useTaskStore.getState()
      const currentId = store.currentConversationId

      // 🔥🔥🔥 简化判断：检查是否需要重新加载
      // 1. 会话不匹配：需要加载
      // 2. 消息未加载：需要加载
      const isSameConversation = currentId === targetConversationId
      const hasMessages = store.messages.length > 0
      
      // 如果会话和消息都已加载，检查 tasks 是否需要恢复
      if (isSameConversation && hasMessages) {
        // 🔥 检查 localStorage 是否已恢复完整数据
        // 如果 tasks.size > 0 且 session 存在，说明数据已完整恢复
        if (taskStore.tasks.size > 0 && taskStore.session) {
          debug('Tasks 已从 localStorage 恢复，跳过 API 调用')
          debug('tasks.size:', taskStore.tasks.size, 'session:', taskStore.session.session_id)
          return null
        }
        
        // localStorage 没有恢复数据，需要从 API 获取
        debug('localStorage 未恢复 tasks，从 API 获取')
        const conversation = await getConversation(targetConversationId)
        
        if (conversation.task_session && conversation.task_session.sub_tasks?.length > 0) {
          debug('从 API 恢复 tasks:', conversation.task_session.session_id)
          clearTasks(true)
          restoreFromSession(conversation.task_session, conversation.task_session.sub_tasks)
        }
        return conversation
      }

      // 需要重新加载
      debug('开始加载会话:', targetConversationId, '当前会话:', currentId)

      const conversation = await getConversation(targetConversationId)

      // 清空旧消息
      if (currentId !== targetConversationId) {
        debug('清空旧消息，准备加载新会话')
        setMessages([])
      }

      setCurrentConversationId(targetConversationId)

      // 设置消息
      if (conversation.messages && conversation.messages.length > 0) {
        setMessages(conversation.messages)
        debug('设置会话消息:', conversation.messages.length, '条')
      } else {
        setMessages([])
        debug('会话无消息，清空消息列表')
      }

      // 设置 agent
      if (conversation.agent_id) {
        setSelectedAgentId(normalizeAgentId(conversation.agent_id))
      }

      // 清空旧任务状态
      clearTasks(true)

      // 恢复 task_session
      debug('conversation.task_session:', conversation.task_session)
      debug('conversation.task_session_id:', conversation.task_session_id)
      debug('conversation.agent_type:', conversation.agent_type)

      if (conversation.task_session) {
        debug('恢复 task_session:', conversation.task_session.session_id || conversation.task_session.id, 'sub_tasks:', conversation.task_session.sub_tasks?.length)
        restoreFromSession(conversation.task_session, conversation.task_session.sub_tasks || [])
      } else {
        debug('无 task_session')
      }

      return conversation
    } catch (error: any) {
      // 404 错误：会话不存在（可能是新会话还没在后端创建）
      if (error?.status === 404) {
        debug('会话不存在，可能是新会话')
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
