/**
 * 会话管理 Hook
 * 负责加载历史会话、删除会话等功能
 */

import { useCallback } from 'react'
import { useChatStore, type ChatStore } from '@/store/chatStore'
import { useTaskStore } from '@/store/taskStore'
import { getConversation, deleteConversation as apiDeleteConversation } from '@/services/chat'
import { normalizeAgentId } from '@/utils/agentUtils'
import { errorHandler } from '@/utils/logger'
import type { Conversation } from '@/types'

// 👈 新增 Helper 函数：将后端 JSON 输出转为 Markdown 字符串
const formatTaskOutput = (outputResult: any): string => {
  if (!outputResult) return ''

  // 如果已经是字符串，直接返回
  if (typeof outputResult === 'string') return outputResult

  // 提取核心内容
  let formattedText = outputResult.content || ''

  // 处理来源 (Source) - 适配 Search Expert 的输出结构
  if (outputResult.source && Array.isArray(outputResult.source) && outputResult.source.length > 0) {
    formattedText += '\n\n---\n**参考来源：**\n'
    outputResult.source.forEach((src: any, index: number) => {
      // 容错处理，防止 src 为空
      const title = src.title || '未知来源'
      const url = src.url || '#'
      formattedText += `> ${index + 1}. [${title}](${url})\n`
    })
  }
  // 兼容其他可能的字段名
  else if (outputResult.sources) {
    formattedText += '\n\n**参考资料:** ' + JSON.stringify(outputResult.sources)
  }

  return formattedText
}

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
    initializePlan,
    restoreFromSession,  // 👈 修改：使用 restoreFromSession 替代手动恢复
    addArtifact,
    selectTask,
    clearTasks,
    setMode,
  } = useTaskStore()

  /**
   * 加载历史会话
   */
  const loadConversation = useCallback(async (targetConversationId: string) => {
    try {
      // 使用 getState() 获取最新状态，避免闭包捕获旧值
      const store = useChatStore.getState()
      const currentId = store.currentConversationId

      // 🔥🔥🔥 关键修复：检测是否是页面刷新
      // 页面刷新时 messages 已从 localStorage 恢复，但任务状态需要从数据库恢复
      const isPageRefresh = currentId === targetConversationId && store.messages.length > 0
      
      // 🔥🔥🔥 调试日志：帮助诊断消息消失问题
      console.log('[loadConversation] 调试信息:', {
        targetConversationId,
        currentId,
        messagesCount: store.messages.length,
        isPageRefresh,
        messagesRoles: store.messages.map(m => m.role)
      })

      debug('开始加载会话:', targetConversationId, '当前会话:', currentId, '是否页面刷新:', isPageRefresh)

      const conversation = await getConversation(targetConversationId)

      // 👈 关键：非页面刷新时才清空和设置消息
      if (!isPageRefresh) {
        if (currentId !== targetConversationId) {
          debug('清空旧消息，准备加载新会话')
          setMessages([])
        }

        // 设置当前会话 ID
        setCurrentConversationId(targetConversationId)

        // 👈 关键：确保设置新会话的消息（即使为空也要覆盖）
        if (conversation.messages && conversation.messages.length > 0) {
          setMessages(conversation.messages)
          debug('设置新会话消息:', conversation.messages.length, '条')
        } else {
          setMessages([])
          debug('新会话没有消息，清空消息列表')
        }
      } else {
        // 页面刷新时只设置会话 ID
        setCurrentConversationId(targetConversationId)
        
        // 🔥🔥🔥 关键修复：即使认为是页面刷新，也检查后端消息是否更多
        // 这可以修复 localStorage 消息不完整的问题
        if (conversation.messages && conversation.messages.length > store.messages.length) {
          console.log('[loadConversation] 后端消息更多，更新消息列表:', {
            local: store.messages.length,
            remote: conversation.messages.length
          })
          setMessages(conversation.messages)
        }
      }

      // 设置选中的智能体（使用规范化后的 ID）
      if (conversation.agent_id) {
        setSelectedAgentId(normalizeAgentId(conversation.agent_id))
      }

      // 👈 关键修复：无论是什么类型的会话，都先清空 task 状态
      // 避免从复杂模式切换到简单模式时残留 artifacts
      clearTasks()

      // v3.0: 只要有 task_session 就恢复任务状态（支持刷新后恢复）
      // 注意：之前检查 agent_type === 'ai'，但可能由于时序问题导致 agent_type 未更新
      // 现在只要有 task_session 数据就恢复
      if (conversation.task_session) {
        // 👈 使用 restoreFromSession 方法（taskStore 中已实现）
        // 该方法已经包含了以下逻辑：
        // 1. 状态分流（completed/running/pending）
        // 2. Artifacts 恢复
        // 3. 字段映射（output -> output_result）
        restoreFromSession(conversation.task_session, conversation.task_session.sub_tasks || [])
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
    restoreFromSession  // 👈 修改：使用 restoreFromSession
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
