/**
 * 聊天核心逻辑 Hook
 * 负责消息发送、停止生成、加载状态管理等核心功能
 */

import { useCallback, useState, useRef } from 'react'
import { sendMessage as apiSendMessage, type ApiMessage, type StreamCallback } from '@/services/chat'
import { useChatStore } from '@/store/chatStore'
import { getConversationMode, normalizeAgentId } from '@/utils/agentUtils'
import { generateUUID } from '@/utils'
import { useTranslation } from '@/i18n'
import type { ExpertEvent, Artifact } from '@/types'
import { errorHandler, logger } from '@/utils/logger'
import { isValidApiMessageRole } from '@/types'

// 开发环境判断
const DEBUG = import.meta.env.VITE_DEBUG_MODE === 'true'

// 统一的调试日志函数
const debug = DEBUG
  ? (...args: unknown[]) => logger.debug('[useChatCore]', ...args)
  : () => {}

/**
 * ApiMessage 类型守卫函数
 */
function isApiMessage(obj: any): obj is ApiMessage {
  return (
    obj &&
    typeof obj === 'object' &&
    'role' in obj &&
    'content' in obj &&
    isValidApiMessageRole(obj.role) &&
    typeof obj.content === 'string'
  )
}

interface UseChatCoreOptions {
  /** 处理专家事件的回调 */
  onExpertEvent?: (event: ExpertEvent, conversationMode: 'simple' | 'complex') => Promise<void> | void
  /** 处理 Artifact 的回调 */
  onArtifact?: (artifact: Artifact, expertId: string) => void
  /** 处理流式内容的回调 */
  onChunk?: (chunk: string) => void
  /** 新会话创建时的回调 */
  onNewConversation?: (conversationId: string, agentId: string) => void
}

/**
 * 聊天核心逻辑 Hook
 */
export function useChatCore(options: UseChatCoreOptions = {}) {
  const { t } = useTranslation()
  const { onExpertEvent, onArtifact, onChunk, onNewConversation } = options

  // 状态管理
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [error, setError] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const [isSending, setIsSending] = useState(false) // 请求锁，防止重复提交

  // 从 chatStore 获取状态和方法
  const {
    messages,
    inputMessage,
    setInputMessage,
    selectedAgentId,
    currentConversationId,
    setCurrentConversationId,
    addMessage,
    updateMessage,
    isTyping,
    setIsTyping,
  } = useChatStore()

  /**
   * 停止生成
   */
  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      debug('停止生成')
      abortControllerRef.current.abort()
    }
  }, [])

  /**
   * 发送消息核心逻辑
   */
  const sendMessageCore = useCallback(async (
    content?: string,
    overrideAgentId?: string
  ) => {
    // 请求去重：防止重复提交
    if (isSending) {
      debug('请求正在进行中，忽略重复提交')
      return
    }

    const userContent = content || inputMessage
    if (!userContent.trim()) return

    setIsSending(true)

    // 优先使用传入的 agentId，否则使用 store 中的 selectedAgentId
    const agentId = overrideAgentId || selectedAgentId
    if (!agentId) {
      logger.error('[useChatCore] 未选择智能体')
      setIsSending(false)
      return
    }
    const normalizedAgentId = normalizeAgentId(agentId)
    const conversationMode = getConversationMode(normalizedAgentId)

    // 创建新的 AbortController
    abortControllerRef.current = new AbortController()

    let assistantMessageId: string | undefined

    try {
      // 1. 准备请求数据 - 使用严格的 ApiMessage 类型
      const chatMessages: ApiMessage[] = [
        ...messages,
        { role: 'user', content: userContent }
      ]
        .filter((m): m is ApiMessage => {
          // 类型守卫：确保只保留有效的 ApiMessage
          return isApiMessage(m)
        })
        .map((m): ApiMessage => ({
          role: m.role,
          content: m.content
        }))

      // 2. 添加用户消息
      addMessage({ role: 'user', content: userContent })
      setInputMessage('')
      setIsTyping(true)

      // 3. 预先添加 AI 空消息
      assistantMessageId = generateUUID()
      addMessage({
        id: assistantMessageId,
        role: 'assistant',
        content: ''
      })

      // 4. 如果是复杂模式，添加任务开始提示
      if (conversationMode === 'complex') {
        addMessage({
          id: generateUUID(),
          role: 'system',
          content: t('detectingComplexTask')
        })
      }

      // 5. 发送请求并处理流式响应
      let finalResponseContent = ''
      let actualConversationId = currentConversationId

      debug('准备调用 sendMessage')
      setIsStreaming(true)
      setStreamingContent('')
      setError(null)

      const streamCallback: StreamCallback = async (
        chunk: string | undefined,
        conversationId?: string,
        expertEvent?: ExpertEvent,
        artifact?: Artifact,
        expertId?: string
      ) => {
        // 更新 conversationId
        if (conversationId && conversationId !== actualConversationId) {
          actualConversationId = conversationId
          setCurrentConversationId(conversationId)
        }

        // 处理专家事件
        if (expertEvent) {
          onExpertEvent?.(expertEvent, conversationMode)
        }

        // 处理 artifact
        if (artifact && expertId) {
          onArtifact?.(artifact, expertId)
        }

        // 实时更新流式内容
        if (chunk) {
          finalResponseContent += chunk
          setStreamingContent(finalResponseContent)

          if (conversationMode === 'simple' && assistantMessageId) {
            debug('更新消息:', assistantMessageId, 'chunk length:', chunk.length)
            updateMessage(assistantMessageId, chunk, true)
          }

          // 调用外部 onChunk 回调
          onChunk?.(chunk)
        }
      }

      finalResponseContent = await apiSendMessage(
        chatMessages,
        normalizedAgentId,
        streamCallback,
        currentConversationId,
        abortControllerRef.current.signal
      )

      setIsStreaming(false)
      setStreamingContent('')

      // 6. 更新 URL 中的 conversationId（通过回调）
      if (actualConversationId !== currentConversationId) {
        onNewConversation?.(actualConversationId, selectedAgentId)
      }

      // 7. 更新最终响应到助手消息
      if (finalResponseContent && assistantMessageId) {
        debug(`更新助手消息 ${assistantMessageId}，长度: ${finalResponseContent.length}，模式: ${conversationMode}`)

        // 复杂模式：检测技术内容，如果是则替换成友好文案
        let messageContent = finalResponseContent
        if (conversationMode === 'complex') {
          const hasTechnicalContent = finalResponseContent.includes('```') ||
                                  finalResponseContent.includes('{') && finalResponseContent.includes('}') ||
                                  finalResponseContent.includes('[') && finalResponseContent.includes(']')

          if (hasTechnicalContent) {
            messageContent = t('complexTaskCompleted')
          }
        }

        updateMessage(assistantMessageId, messageContent)
      }

      setIsSending(false)
      return finalResponseContent

    } catch (error) {
      setIsSending(false)

      // 检查是否是用户手动取消
      if (error instanceof Error && error.name === 'AbortError') {
        debug('请求已取消')
        // 移除空的 AI 消息
        if (assistantMessageId) {
          updateMessage(assistantMessageId, '', false)
        }
      } else {
        // 使用统一的错误处理器
        errorHandler.handle(error, 'sendMessageCore')

        // 添加错误消息到聊天
        const userMessage = errorHandler.getUserMessage(error)
        setError(userMessage)
        addMessage({
          role: 'assistant',
          content: userMessage
        })
      }
    } finally {
      setIsTyping(false)
      setIsStreaming(false)
      abortControllerRef.current = null
    }
  }, [
    isSending,
    messages,
    inputMessage,
    selectedAgentId,
    currentConversationId,
    onExpertEvent,
    onArtifact,
    onChunk,
    onNewConversation
  ])

  return {
    // 状态
    messages,
    inputMessage,
    isStreaming,
    streamingContent,
    isLoading: isTyping,
    error,
    isSending,

    // 方法
    sendMessage: sendMessageCore,
    stopGeneration,
    setInputMessage,
  }
}
