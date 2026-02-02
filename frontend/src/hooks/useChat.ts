/**
 * 聊天 Hook（重构版）
 *
 * @description
 * 这是组合式 Hook，将聊天逻辑拆分为多个单一职责的子 Hooks：
 * - useChatCore: 核心聊天逻辑（发送、停止、加载状态）
 * - useExpertHandler: 专家事件处理（激活、完成、任务计划、artifact 处理）
 * - useConversation: 会话管理（加载、删除）
 *
 * @returns {
 *   sendMessage: 发送消息函数
 *   messages: 消息列表
 *   isStreaming: 是否正在流式输出
 *   isLoading: 是否正在加载
 *   error: 错误信息
 *   inputMessage: 输入消息
 *   setInputMessage: 设置输入消息
 *   stopGeneration: 停止生成
 *   loadConversation: 加载历史会话
 *   deleteConversation: 删除会话
 *   retry: 重试最后一条消息
 * }
 *
 * @example
 * ```typescript
 * const { sendMessage, messages, isStreaming, stopGeneration } = useChat()
 * await sendMessage('你好，帮我搜索信息')
 * stopGeneration() // 取消正在发送的消息
 * ```
 */

import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useChatStore } from '@/store/chatStore'
import { useChatCore } from './chat/useChatCore'
import { useExpertHandler } from './chat/useExpertHandler'
import { useConversation } from './chat/useConversation'
import { errorHandler } from '@/utils/logger'

export function useChat() {
  const navigate = useNavigate()

  // ? 重构：直接从 Store 读取状态
  const {
    messages,
    inputMessage,
    setInputMessage,
    isGenerating,
  } = useChatStore()

  // 1. 组合专家事件处理（包含 artifact 处理）
  const { handleExpertEvent: handleExpertEventRaw } = useExpertHandler()
  const handleExpertEvent = useCallback(async (
    event: any,
    conversationMode: 'simple' | 'complex'
  ) => {
    await handleExpertEventRaw(event, conversationMode)
  }, [handleExpertEventRaw])

  // 2. 获取带回调的聊天核心逻辑
  const chatCore = useChatCore({
    onNewConversation: useCallback((conversationId: string, agentId: string) => {
      // 默认助手不添加 agentId 参数，让后端自动使用 sys-default-chat
      if (agentId && agentId !== 'sys-default-chat' && agentId !== 'default-chat') {
        navigate(`/chat/${conversationId}?agentId=${agentId}`, { replace: true })
      } else {
        navigate(`/chat/${conversationId}`, { replace: true })
      }
    }, [navigate]),
    onExpertEvent: handleExpertEvent,
  })

  // 5. 获取会话管理器
  const conversationManager = useConversation()

  // 6. 重试最后一条用户消息
  const retry = useCallback(() => {
    const lastMessage = conversationManager.messages.filter(m => m.role === 'user').pop()
    if (lastMessage?.content) {
      chatCore.sendMessage(lastMessage.content)
    }
  }, [conversationManager.messages, chatCore])

  return {
    // ========== 状态：直接从 Store 读取 ==========
    messages: conversationManager.messages,
    inputMessage,
    isStreaming: isGenerating,  // ? 从 Store 读取，映射为 isStreaming 保持 API 一致
    conversationMode: chatCore.conversationMode,  // ? 从 useChatCore 获取

    // ========== 方法 ==========
    sendMessage: chatCore.sendMessage,
    setInputMessage,
    stopGeneration: chatCore.stopGeneration,

    // 会话管理
    loadConversation: conversationManager.loadConversation,
    deleteConversation: conversationManager.deleteConversation,

    // 重试
    retry,
  }
}
