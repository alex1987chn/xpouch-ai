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
  const loadConversation = useCallback(async (targetConversationId: string) => {
    try {
      // 👈 使用 getState() 获取最新状态，避免闭包捕获旧值
      const store = useChatStore.getState()
      const currentId = store.currentConversationId

      // 👈 关键修复：只在完全相同的会话且有消息时才阻止加载
      // 注意：必须严格比较，确保不会加载错误的会话
      if (currentId === targetConversationId && store.messages.length > 0) {
        debug('阻止重复加载：已是当前会话且已有消息', targetConversationId)
        return
      }

      debug('开始加载会话:', targetConversationId, '当前会话:', currentId)

      const conversation = await getConversation(targetConversationId)

      // 👈 关键：先清空旧消息，再设置新会话ID，避免用户看到旧数据
      if (currentId !== targetConversationId) {
        debug('清空旧消息，准备加载新会话')
        setMessages([])
      }

      // 设置当前会话 ID
      setCurrentConversationId(targetConversationId)

      // 👈 关键：确保设置新会话的消息（即使为空也要覆盖）
      // 避免残留旧会话的消息
      if (conversation.messages && conversation.messages.length > 0) {
        setMessages(conversation.messages)
        debug('设置新会话消息:', conversation.messages.length, '条')
      } else {
        setMessages([])
        debug('新会话没有消息，清空消息列表')
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
