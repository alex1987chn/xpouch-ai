/**
 * 会话管理 Hook
 * 负责加载历史会话、删除会话等功能
 * v3.1: 移除 canvasStore，使用 taskStore 管理复杂模式状态
 */

import { useCallback } from 'react'
import { useChatStore, type ChatStore } from '@/store/chatStore'
import { useTaskStore } from '@/store/taskStore'
import { getConversation, deleteConversation as apiDeleteConversation } from '@/services/chat'
import { normalizeAgentId } from '@/utils/agentUtils'
import { errorHandler } from '@/utils/logger'
import type { Conversation } from '@/types'

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

  // v3.1: 使用 taskStore 替代 canvasStore
  const {
    initializePlan,
    completeTask,
    addArtifact,
    selectTask,
    clearTasks,
    setMode,
  } = useTaskStore()

  /**
   * 加载历史会话
   */
  const loadConversation = useCallback(async (targetConversationId: string) => {
    // eslint-disable-next-line no-console
    console.log('[loadConversation] called:', { targetConversationId })
    try {
      // 👈 使用 getState() 获取最新状态，避免闭包捕获旧值
      const store = useChatStore.getState()
      const currentId = store.currentConversationId

      // eslint-disable-next-line no-console
      console.log('[loadConversation] current state:', { currentId, targetConversationId, messageCount: store.messages.length })

      // 👈 关键修复：只在完全相同的会话且有消息时才阻止加载
      // 注意：必须严格比较，确保不会加载错误的会话
      if (currentId === targetConversationId && store.messages.length > 0) {
        // eslint-disable-next-line no-console
        console.log('[loadConversation] blocked: same conversation with messages')
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

      // v3.1: 如果是复杂模式会话，使用 taskStore 恢复任务状态
      if (conversation.agent_type === 'ai' && conversation.task_session) {
        const subTasks = conversation.task_session.sub_tasks || []

        // 清空旧任务
        clearTasks()
        setMode('complex')

        // 初始化任务计划
        initializePlan({
          session_id: conversation.task_session.id,
          summary: conversation.task_session.summary || '复杂任务',
          estimated_steps: subTasks.length,
          execution_mode: 'sequential',
          tasks: subTasks.map((st: any) => ({
            id: st.id || `task-${Date.now()}`,
            expert_type: st.expert_type,
            description: st.task_description || `${st.expert_type} 任务`,
            status: st.status || 'completed',
            sort_order: st.sort_order || 0
          }))
        })

        // 恢复每个子任务的状态和 artifacts
        subTasks.forEach((subTask: any) => {
          const taskId = subTask.id || `task-${Date.now()}`

          // 完成任务（恢复历史状态）
          completeTask({
            task_id: taskId,
            duration_ms: subTask.duration_ms,
            output: subTask.output,
            error: subTask.error
          })

          // 恢复 artifacts
          if (subTask.artifacts && Array.isArray(subTask.artifacts) && subTask.artifacts.length > 0) {
            subTask.artifacts.forEach((item: any) => {
              addArtifact({
                task_id: taskId,
                expert_type: subTask.expert_type,
                artifact: {
                  id: item.id || `artifact-${Date.now()}`,
                  type: item.type || 'code',
                  title: item.title || `${subTask.expert_type} 产物`,
                  content: item.content || '',
                  language: item.language
                }
              })
            })
          }
        })

        // 自动选中第一个任务
        if (subTasks.length > 0) {
          const firstTaskId = subTasks[0].id
          if (firstTaskId) {
            selectTask(firstTaskId)
          }
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
    clearTasks,
    setMode,
    initializePlan,
    completeTask,
    addArtifact,
    selectTask
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
