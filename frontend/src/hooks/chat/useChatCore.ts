/**
 * 聊天核心逻辑 Hook
 * 负责消息发送、停止生成、加载状态管理等核心功能
 *
 * 符合 SDUI 原则：单一数据源
 *
 * v3.4.4：发送/恢复/重生成三条流程共享的骨架收敛为
 * isAbortError（模块级纯函数）+ makeStreamCallback（回调工厂）+
 * finalizeStream（统一收尾）；各流程只保留差异部分。
 */

import { useCallback, useRef, useEffect } from 'react'
import {
  sendMessage as apiSendMessage,
  resumeChat as apiResumeChat,
  cancelRun as apiCancelRun,
  type ResumeChatParams
} from '@/services/chat'
import type { ApiMessage, StreamCallback, StreamRuntimeMeta } from '@/types'
import { normalizeAgentId, getAgentType } from '@/utils/agentUtils'
import { generateUUID } from '@/utils'
import { findMessageById, isSameId } from '@/utils/normalize'
import type { Message } from '@/types'
import { errorHandler, logger } from '@/utils/logger'
import type { AnyServerEvent } from '@/types/events'

import {
  useInputMessage,
  useSelectedAgentId,
  useCurrentConversationId,
  useIsGenerating,
  useChatActions,
} from '@/hooks/useChatSelectors'
import { useActiveRunId, useTaskMode, useTaskActions } from '@/hooks/useTaskSelectors'
import { useChatStore } from '@/store/chatStore'

import { useStreamHandler } from './useStreamHandler'
import { clearProcessedMessageDone } from '@/handlers/chatEvents'

// Dev environment check
const DEBUG = import.meta.env.VITE_DEBUG_MODE === 'true'

// Unified debug log function
const debug = DEBUG
  ? (...args: unknown[]) => logger.debug('[useChatCore]', ...args)
  : () => {}

interface UseChatCoreOptions {
  /** Handle streaming content callback */
  onChunk?: (chunk: string) => void
  /** New conversation created callback */
  onNewConversation?: (threadId: string, agentId: string) => void
}

function getErrorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const maybe = error as { status?: number }
  return maybe.status
}

/** 统一的中断判定（用户停止 / 组件卸载 abort / 服务端取消措辞） */
function isAbortError(error: unknown, signal?: AbortSignal | null): boolean {
  if (signal?.aborted) return true
  if (!(error instanceof Error)) return false
  return (
    error.name === 'AbortError' ||
    error.message?.toLowerCase().includes('abort') ||
    error.message?.toLowerCase().includes('cancel') ||
    error.message?.includes('取消')
  )
}

/**
 * Chat core logic Hook
 */
export function useChatCore(options: UseChatCoreOptions = {}) {
  const { onChunk, onNewConversation } = options

  // Refactored: Hook only manages AbortController
  const abortControllerRef = useRef<AbortController | null>(null)

  const conversationMode = useTaskMode() || 'simple'
  const activeRunId = useActiveRunId()

  // Chat store selectors
  const inputMessage = useInputMessage()
  const selectedAgentId = useSelectedAgentId()
  const currentConversationId = useCurrentConversationId()
  const isGenerating = useIsGenerating()

  // Actions
  const {
    setInputMessage,
    setCurrentConversationId,
    addMessage,
    updateMessage,
    setMessages,
    setGenerating
  } = useChatActions()

  const { setMode, setActiveRunId, clearActiveRunId } = useTaskActions()

  const { reset: resetStreamHandler, createChunkHandler, forceFlush, markFinalized } =
    useStreamHandler()

  /** 三条流程共用的收尾：flush 缓冲 → 复位生成态 → 清 run → 释放 abort */
  const finalizeStream = useCallback(() => {
    forceFlush()
    setGenerating(false)
    clearActiveRunId()
    abortControllerRef.current = null
  }, [forceFlush, setGenerating, clearActiveRunId])

  /**
   * 流式回调工厂：syncRuntimeMeta + 可选的 threadId 同步 / 完成闩锁，
   * chunk 统一交给 handleChunk（RAF 批处理层）。
   * 完整正文一律以 API 返回值为准（回调内不做累积——历史版本的累积
   * 均被返回值覆盖，属死代码）。
   */
  const makeStreamCallback = useCallback((
    handleChunk: (chunk: string) => void,
    handlers: {
      onThreadId?: (threadId: string) => void
      onDone?: () => void
    } = {}
  ): StreamCallback => {
    return async (
      chunk: string | undefined,
      threadId?: string,
      expertEvent?: AnyServerEvent,
      _artifact?,
      _expertId?,
      runtimeMeta?: StreamRuntimeMeta,
    ) => {
      if (runtimeMeta?.runId) {
        setActiveRunId(runtimeMeta.runId)
      }
      if (threadId) handlers.onThreadId?.(threadId)
      if (expertEvent?.type === 'message.done') handlers.onDone?.()
      if (chunk) handleChunk(chunk)
    }
  }, [setActiveRunId])

  /**
   * Stop generation
   */
  const stopGeneration = useCallback(() => {
    const finalizeAbort = () => {
      if (abortControllerRef.current) {
        debug('Stop generation')
        abortControllerRef.current.abort()
      }
      setGenerating(false)
      clearActiveRunId()
    }

    if (!activeRunId) {
      finalizeAbort()
      return
    }

    void apiCancelRun(activeRunId)
      .catch((error) => {
        logger.warn('[useChatCore] cancelRun failed, fallback to local abort:', error)
      })
      .finally(() => {
        finalizeAbort()
      })
  }, [activeRunId, clearActiveRunId, setGenerating])

  /**
   * Send message core logic
   */
  const sendMessageCore = useCallback(async (
    content?: string,
    overrideAgentId?: string,
    images?: string[]
  ) => {
    // Deduplication: prevent duplicate submissions
    if (isGenerating) {
      debug('Request in progress, ignoring duplicate submission')
      return
    }

    const userContent = (content || inputMessage || '').trim()
    if (!userContent && !images?.length) {
      debug('Message content is empty, skipping send')
      return
    }

    setGenerating(true)

    // Reset taskStore mode, wait for backend Router decision
    setMode('simple')

    resetStreamHandler()

    const agentId = overrideAgentId || selectedAgentId
    if (!agentId) {
      logger.error('[useChatCore] No agent selected')
      setGenerating(false)
      return
    }
    const normalizedAgentId = normalizeAgentId(agentId)

    abortControllerRef.current = new AbortController()

    const assistantMessageId = generateUUID()

    try {
      const storeState = useChatStore.getState()
      const validHistoryMessages = storeState.messages
        .filter((m): m is Message & { content: string } =>
          !!m && typeof m.content === 'string' && m.content.length > 0
        )
        .map((m): ApiMessage => ({
          role: m.role as 'user' | 'assistant',
          content: m.content
        }))

      const chatMessages: ApiMessage[] = [
        ...validHistoryMessages,
        { role: 'user', content: userContent }
      ]

      debug('Preparing to send message, history count:', storeState.messages.length, 'Current input:', userContent)

      const agentType = getAgentType(normalizedAgentId)
      debug('Agent type:', agentType, 'Agent ID:', normalizedAgentId)

      // 🔥🔥🔥 关键修复：使用函数式更新避免竞态条件
      // 确保获取最新的 messages 状态，而不是使用闭包中的快照
      setMessages((prevMessages) => {
        const newMessages = [
          ...prevMessages,
          { role: 'user' as const, content: userContent, timestamp: Date.now() },
          {
            id: assistantMessageId,
            role: 'assistant' as const,
            content: '',
            timestamp: Date.now(),
            metadata: {
              thinking: []
            }
          }
        ]
        debug('Messages after adding new:', newMessages.length, 'AI message ID:', assistantMessageId)
        return newMessages
      })

      setInputMessage('')

      let actualThreadId = useChatStore.getState().currentConversationId || currentConversationId

      debug('Preparing to call sendMessage')

      const handleChunk = createChunkHandler(assistantMessageId, onChunk)

      const streamCallback = makeStreamCallback(handleChunk, {
        onThreadId: (threadId) => {
          if (threadId !== actualThreadId) {
            actualThreadId = threadId
            setCurrentConversationId(threadId)
            // 🔥 触发新会话回调，让上层组件更新 URL
            onNewConversation?.(threadId, normalizedAgentId)
          }
        },
        // message.done 的 full_content 是权威全文（chatEvents 已整体校准）；
        // 置完成闩锁，防止 finally 的 forceFlush 再把同帧缓冲追加到尾部
        onDone: markFinalized,
      })

      const finalResponseContent = await apiSendMessage(
        chatMessages,
        normalizedAgentId,
        streamCallback,
        actualThreadId,
        abortControllerRef.current.signal,
        assistantMessageId,
        images
      )

      const initialThreadId = useChatStore.getState().currentConversationId
      if (actualThreadId && actualThreadId !== initialThreadId) {
        onNewConversation?.(actualThreadId, selectedAgentId)
      }

      debug(`Task completed, final content length: ${finalResponseContent?.length || 0}`)

      return finalResponseContent

    } catch (error) {
      const maybeConflict = error as { status?: number; code?: string; message?: string }
      const isActiveRunConflict =
        maybeConflict?.status === 409 &&
        (maybeConflict?.code === 'ACTIVE_RUN_CONFLICT' ||
          maybeConflict?.message?.includes('当前会话已有进行中的任务'))
      const aborted = isAbortError(error, abortControllerRef.current?.signal)

      // 🔐 检测 401 错误，保存消息以便登录后重发
      const isAuthError = getErrorStatus(error) === 401

      if (aborted) {
        debug('Request cancelled (user initiated)')
        // 保留已流出的部分内容（后端 cancel 流程也会持久化已生成部分），
        // 此前整体置空会丢掉用户已经看到的半截回答
      } else if (isAuthError) {
        // 401 错误：保存消息到 pendingMessage，等待登录后重发
        debug('Authentication error (401), saving message for retry after login')
        useChatStore.getState().setPendingMessage(userContent)
        // 移除刚才添加的用户消息和助手消息（因为实际没有发送成功）
        const currentMessages = useChatStore.getState().messages
        useChatStore.getState().setMessages(currentMessages.slice(0, -2))
      } else if (isActiveRunConflict) {
        addMessage({
          role: 'assistant',
          content: '当前会话已有进行中的任务，请先等待完成、确认恢复、取消任务，或切换到新会话后再继续。',
          metadata: { threadId: currentConversationId ?? undefined }
        })
      } else {
        errorHandler.handle(error, 'sendMessageCore')

        const userMessage = errorHandler.getUserMessage(error)
        addMessage({
          role: 'assistant',
          content: userMessage,
          metadata: { threadId: currentConversationId ?? undefined }
        })
      }
    } finally {
      finalizeStream()

      if (conversationMode === 'complex' && assistantMessageId) {
        const currentMessages = useChatStore.getState().messages
        // 🔥 使用规范化工具查找
        const assistantMsg = findMessageById(currentMessages, assistantMessageId)
        if (assistantMsg && !assistantMsg.content?.trim()) {
          debug('Complex mode: keep empty AI message waiting for aggregator summary', assistantMessageId)
        }
      }
    }
  }, [
    isGenerating,
    inputMessage,
    selectedAgentId,
    currentConversationId,
    conversationMode,
    onChunk,
    onNewConversation,
    setGenerating,
    setMode,
    setMessages,
    setInputMessage,
    setCurrentConversationId,
    addMessage,
    resetStreamHandler,
    createChunkHandler,
    finalizeStream,
    makeStreamCallback,
    markFinalized,
  ])

  // Component unmount cleanup
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        debug('Component unmounting, aborting ongoing request')
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
      clearActiveRunId()
    }
  }, [clearActiveRunId])

  const resumeExecution = useCallback(async (
    params: ResumeChatParams
  ): Promise<string> => {
    if (isGenerating) {
      debug('Request in progress, ignoring duplicate resume request')
      // 修复：静默返回空串会被调用方当成功，UI 进入"恢复中"却无任何请求（实测卡死场景）。
      // 改为显式抛错，让 PlanReviewCard 恢复审批卡片并提示用户。
      throw new Error('已有请求正在进行，请稍后再试')
    }

    setGenerating(true)
    abortControllerRef.current = new AbortController()

    // 🔥 创建助手消息来接收 resume 的流式内容
    const assistantMessageId = generateUUID()
    addMessage({
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      metadata: {
        thinking: []
      }
    })

    resetStreamHandler()

    const handleChunk = createChunkHandler(assistantMessageId, onChunk)

    try {
      const streamCallback = makeStreamCallback(handleChunk)

      const fullContent = await apiResumeChat(
        params,
        streamCallback,
        abortControllerRef.current.signal
      )

      return fullContent

    } catch (error) {
      if (!isAbortError(error, abortControllerRef.current?.signal)) {
        errorHandler.handle(error, 'resumeExecution')
        addMessage({
          role: 'assistant',
          content: errorHandler.getUserMessage(error)
        })
      } else {
        debug('Request cancelled (user navigated away or manually aborted)')
      }

      throw error
    } finally {
      finalizeStream()
    }
  }, [isGenerating, onChunk, setGenerating, addMessage, resetStreamHandler, createChunkHandler, finalizeStream, makeStreamCallback])

  /**
   * 重新生成指定 AI 消息的回复
   * 用于点击"重试"按钮时，不重复添加用户消息，直接重新生成 AI 回复
   *
   * @param messageId - 要重新生成的 AI 消息 ID
   */
  const regenerateMessage = useCallback(async (messageId: string | number) => {
    if (isGenerating) {
      debug('Request in progress, ignoring regenerate request')
      return
    }

    const storeState = useChatStore.getState()
    const allMessages = storeState.messages

    // 找到要重新生成的 AI 消息索引（支持 string 和 number 类型的 ID 比较）
    const targetIndex = allMessages.findIndex(m =>
      isSameId(m.id, messageId) && m.role === 'assistant'
    )
    if (targetIndex === -1) {
      logger.error('[regenerateMessage] AI message not found:', messageId)
      return
    }

    // 获取该 AI 消息之前的历史记录（不包括该 AI 消息本身）
    const historyMessages = allMessages.slice(0, targetIndex)

    // 找到最近的用户消息（作为重新发送的"问题"）
    const lastUserMessage = [...historyMessages].reverse().find(m => m.role === 'user')
    if (!lastUserMessage?.content) {
      logger.error('[regenerateMessage] No user message found before AI message')
      return
    }

    debug('[regenerateMessage] Regenerating response for message:', messageId, 'User content:', lastUserMessage.content)

    // 🔥 清除该消息 ID 的去重记录，允许再次处理
    clearProcessedMessageDone(String(messageId))

    setGenerating(true)
    setMode('simple')
    resetStreamHandler()

    const agentId = selectedAgentId
    if (!agentId) {
      logger.error('[regenerateMessage] No agent selected')
      setGenerating(false)
      return
    }
    const normalizedAgentId = normalizeAgentId(agentId)

    abortControllerRef.current = new AbortController()

    try {
      // 🔥 如果目标消息不是最后一条，删除它之后的所有消息
      // 这样可以确保重新生成的回复是基于正确的上下文
      if (targetIndex < allMessages.length - 1) {
        const truncatedMessages = allMessages.slice(0, targetIndex + 1)
        setMessages(truncatedMessages)
        debug('[regenerateMessage] Truncated messages after target:', truncatedMessages.length)
      }

      // 构建 API 历史记录（不包括目标 AI 消息本身，但包括之前的所有消息）
      const validHistoryMessages = historyMessages
        .filter((m): m is Message & { content: string } =>
          !!m && typeof m.content === 'string' && m.content.length > 0
        )
        .map((m): ApiMessage => ({
          role: m.role as 'user' | 'assistant',
          content: m.content
        }))

      // 清空目标 AI 消息的内容（准备重新生成）
      updateMessage(String(messageId), '', false)

      // 重置消息的 metadata
      useChatStore.getState().updateMessageMetadata?.(String(messageId), {
        thinking: []
      })

      const handleChunk = createChunkHandler(String(messageId), onChunk)

      const streamCallback = makeStreamCallback(handleChunk, {
        onThreadId: (threadId) => {
          if (threadId !== useChatStore.getState().currentConversationId) {
            setCurrentConversationId(threadId)
          }
        },
      })

      await apiSendMessage(
        validHistoryMessages,
        normalizedAgentId,
        streamCallback,
        storeState.currentConversationId || currentConversationId,
        abortControllerRef.current.signal,
        String(messageId)  // 🔥 确保 message_id 是 string 类型
      )

    } catch (error) {
      if (!isAbortError(error, abortControllerRef.current?.signal)) {
        errorHandler.handle(error, 'regenerateMessage')
        updateMessage(String(messageId), errorHandler.getUserMessage(error), false)
      } else {
        debug('Request cancelled (user navigated away or manually aborted)')
      }
    } finally {
      finalizeStream()
    }
  }, [isGenerating, selectedAgentId, currentConversationId, setGenerating, setMode, setMessages, resetStreamHandler, createChunkHandler, onChunk, setCurrentConversationId, updateMessage, finalizeStream, makeStreamCallback])

  return {
    sendMessage: sendMessageCore,
    stopGeneration,
    resumeExecution,
    regenerateMessage,
    conversationMode,
    isGenerating,
  }
}
