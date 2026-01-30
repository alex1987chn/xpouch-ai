/**
 * 聊天 Hook（重构版）
 *
 * @description
 * 这是组合型 Hook，将聊天逻辑拆分为多个单一职责的子 Hooks：
 * - useChatCore: 核心聊天逻辑（发送、停止、加载状态）
 * - useExpertHandler: 专家事件处理（激活、完成、任务计划）
 * - useArtifactHandler: Artifact 处理（创建、解析、恢复）
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
 *   activeExpertId: 当前激活的专家 ID（已移除，请使用 canvasStore）
 *   setActiveExpertId: 设置激活专家 ID（已移除，请使用 canvasStore）
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
import { useArtifactHandler } from './chat/useArtifactHandler'
import { useConversation } from './chat/useConversation'
import { getConversationMode } from '@/utils/agentUtils'
import { errorHandler } from '@/utils/logger'

export function useChat() {
  const navigate = useNavigate()

  // 1. 获取 Artifact 处理器
  const artifactHandler = useArtifactHandler()

  // 2. 组合 Artifact 处理
  const handleArtifact = useCallback((
    artifact: any,
    expertId: string
  ) => {
    artifactHandler.handleStreamArtifact(artifact, expertId)
  }, [artifactHandler])

  // 3. 组合专家事件处理
  const expertHandler = useExpertHandler()
  const handleExpertEvent = useCallback(async (
    event: any,
    conversationMode: 'simple' | 'complex'
  ) => {
    await expertHandler.handleExpertEvent(event, conversationMode)
  }, [expertHandler])

  // 4. 获取带回调的聊天核心逻辑
  const chatCore = useChatCore({
    onNewConversation: useCallback((conversationId: string, agentId: string) => {
      // 👈 默认助手不添加 agentId 参数，让后端自动使用 sys-default-chat
      if (agentId && agentId !== 'sys-default-chat' && agentId !== 'default-chat') {
        navigate(`/chat/${conversationId}?agentId=${agentId}`, { replace: true })
      } else {
        navigate(`/chat/${conversationId}`, { replace: true })
      }
    }, [navigate]),
    onArtifact: handleArtifact,
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
    // ========== 状态 ==========
    messages: conversationManager.messages,
    streamingContent: chatCore.streamingContent,
    isStreaming: chatCore.isStreaming,
    isLoading: chatCore.isLoading,
    error: chatCore.error,
    inputMessage: chatCore.inputMessage,
    isSending: chatCore.isSending,

    // ========== 方法 ==========
    sendMessage: chatCore.sendMessage,
    setInputMessage: chatCore.setInputMessage,
    stopGeneration: chatCore.stopGeneration,

    // 会话管理
    loadConversation: conversationManager.loadConversation,
    deleteConversation: conversationManager.deleteConversation,

    // 重试
    retry,
  }
}
