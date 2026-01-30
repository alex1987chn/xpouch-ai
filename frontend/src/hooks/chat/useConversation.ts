/**
 * 会话管理 Hook
 * 负责加载历史会话、删除会话等功能
 */

import { useCallback } from 'react'
import { useChatStore, type ChatStore } from '@/store/chatStore'
import { useCanvasStore } from '@/store/canvasStore'
import { getConversation, deleteConversation as apiDeleteConversation } from '@/services/chat'
import { normalizeAgentId } from '@/utils/agentUtils'
import { getExpertConfig, createExpertResult } from '@/constants/systemAgents'
import { generateUUID } from '@/utils'
import { errorHandler } from '@/utils/logger'
import type { Conversation, Artifact } from '@/types'

// 开发环境判断
const DEBUG = import.meta.env.VITE_DEBUG_MODE === 'true'

// 统一的调试日志函数
const debug = DEBUG
  ? (...args: unknown[]) => console.log('[useConversation]', ...args)
  : () => {}

/**
 * 会话管理 Hook
 */
export function useConversation() {
  const {
    messages,
    setMessages,
    currentConversationId,
    setCurrentConversationId,
    setSelectedAgentId,
  } = useChatStore()

  const {
    addExpertResult,
    addArtifactsBatch,
    selectExpert,
    selectArtifactSession,
    clearExpertResults,
  } = useCanvasStore()

  /**
   * 加载历史会话
   */
  const loadConversation = useCallback(async (conversationId: string) => {
    try {
      // 👈 使用 getState() 获取最新状态，避免闭包捕获旧值
      const store = useChatStore.getState()
      const currentId = store.currentConversationId

      // 👈 关键修复：只在完全相同的会话且有消息时才阻止加载
      // 但需要额外的检查：确保消息数量也匹配（避免上一个会话的消息残留）
      if (currentId === conversationId && store.messages.length > 0) {
        debug('阻止重复加载：已是当前会话且已有消息')
        return
      }

      const conversation = await getConversation(conversationId)

      // 设置当前会话 ID
      setCurrentConversationId(conversationId)

      // 设置消息（如果有历史消息则覆盖，否则保持现有消息）
      if (conversation.messages && conversation.messages.length > 0) {
        setMessages(conversation.messages)
      }

      // 设置选中的智能体（使用规范化后的 ID）
      if (conversation.agent_id) {
        setSelectedAgentId(normalizeAgentId(conversation.agent_id))
      }

      // 如果是复杂模式会话，恢复专家结果和 artifacts
      if (conversation.agent_type === 'ai' && conversation.task_session) {
        const subTasks = conversation.task_session.sub_tasks || []

        // 清空旧的专家结果和 artifacts
        clearExpertResults()

        // 恢复每个子任务
        subTasks.forEach((subTask: any) => {
          const expertType = subTask.expert_type
          if (!expertType) return

          // 创建专家结果
          const expertResult = createExpertResult(expertType, subTask.status || 'completed')
          expertResult.completedAt = subTask.created_at
          expertResult.duration = subTask.duration_ms
          expertResult.output = subTask.output
          expertResult.error = subTask.error
          expertResult.description = subTask.task_description

          // 添加专家结果
          addExpertResult(expertResult)

          // 恢复 artifacts
          if (subTask.artifacts && Array.isArray(subTask.artifacts) && subTask.artifacts.length > 0) {
            const artifacts: Artifact[] = subTask.artifacts.map((item: any) => ({
              id: generateUUID(),
              timestamp: item.timestamp || new Date().toISOString(),
              type: item.type,
              title: item.title,
              content: item.content,
              language: item.language
            }))
            addArtifactsBatch(expertType, artifacts)
          }
        })

        // 自动选中第一个专家
        if (subTasks.length > 0) {
          const firstExpertType = subTasks[0].expert_type
          selectExpert(firstExpertType)
          selectArtifactSession(firstExpertType)
        }
      }

      return conversation
    } catch (error) {
      errorHandler.handle(error, 'loadConversation')
      throw error
    }
  }, [
    setMessages,
    setCurrentConversationId,
    setSelectedAgentId,
    clearExpertResults,
    addExpertResult,
    addArtifactsBatch,
    selectExpert,
    selectArtifactSession
  ])

  /**
   * 删除会话
   */
  const deleteConversation = useCallback(async (conversationId: string) => {
    try {
      debug('删除会话:', conversationId)
      await apiDeleteConversation(conversationId)

      // 如果删除的是当前会话，清空消息
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
