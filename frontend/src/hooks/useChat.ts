/**
 * 聊天 Hook（重构版）
 *
 * @description
 * 这是组合式 Hook，将聊天逻辑拆分为多个单一职责的子 Hooks：
 * - useChatCore: 核心聊天逻辑（发送、停止、加载状态）
 * - useConversation: 会话管理（加载、删除）
 *
 * v3.2.0 架构重构：
 * - 移除 useExpertHandler，所有事件处理统一由 eventHandlers.ts 处理
 * - 符合 SDUI 原则：Backend -> SSE -> EventHandler -> Store
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
import { useChatCore } from './chat/useChatCore'
import { useConversation } from './chat/useConversation'
import { errorHandler } from '@/utils/logger'

// Performance Optimized Selectors (v3.1.0)
import {
  useInputMessage,
  useSetInputMessageAction,
} from '@/hooks/useChatSelectors'

export function useChat() {
  const navigate = useNavigate()

  // Performance Optimized Selectors (v3.1.0)
  const inputMessage = useInputMessage()
  const setInputMessage = useSetInputMessageAction()

  // v3.2.0: 所有会话逻辑（Chat & Task）均由 eventHandlers 统一处理，由后端驱动
  // 移除了 useExpertHandler 中间层，简化事件处理链路

  // 1. Get chat core logic with callbacks
  const chatCore = useChatCore({
    onNewConversation: useCallback((conversationId: string, agentId: string) => {
      // 🔥 修复：保留 isNew 状态，避免触发不必要的 loadConversation
      // 后端已创建会话，标记 isNew: false 表示会话已存在
      if (agentId && agentId !== 'sys-default-chat' && agentId !== 'default-chat') {
        navigate(`/chat/${conversationId}?agentId=${agentId}`, { 
          replace: true,
          state: { isNew: false }
        })
      } else {
        navigate(`/chat/${conversationId}`, { 
          replace: true,
          state: { isNew: false }
        })
      }
    }, [navigate]),
    // v3.2.0: onExpertEvent 已移除，事件处理由 eventHandlers.ts 直接处理
  })

  // 2. Get conversation manager
  const conversationManager = useConversation()

  // 3. Retry last user message
  const retry = useCallback(() => {
    const lastMessage = conversationManager.messages.filter(m => m.role === 'user').pop()
    if (lastMessage?.content) {
      chatCore.sendMessage(lastMessage.content)
    }
  }, [conversationManager.messages, chatCore])

  return {
    // ========== State ==========
    messages: conversationManager.messages,
    inputMessage,
    isStreaming: chatCore.isGenerating,
    conversationMode: chatCore.conversationMode,

    // ========== Methods ==========
    sendMessage: chatCore.sendMessage,
    setInputMessage,
    stopGeneration: chatCore.stopGeneration,
    resumeExecution: chatCore.resumeExecution,

    // Conversation management
    loadConversation: conversationManager.loadConversation,
    deleteConversation: conversationManager.deleteConversation,

    // Retry
    retry,
  }
}
