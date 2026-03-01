/**
 * 聊天核心逻辑 Hook
 * 负责消息发送、停止生成、加载状态管理等核心功能
 * 
 * 符合 SDUI 原则：单一数据源
 */

import { useCallback, useRef, useEffect } from 'react'
import { 
  sendMessage as apiSendMessage, 
  resumeChat as apiResumeChat,
  type ResumeChatParams
} from '@/services/chat'
import type { ApiMessage, StreamCallback } from '@/types'
import { normalizeAgentId, getAgentType } from '@/utils/agentUtils'
import { generateUUID } from '@/utils'
import { useTranslation } from '@/i18n'
import type { Message } from '@/types'
import { errorHandler, logger } from '@/utils/logger'
import { isValidApiMessageRole } from '@/types'

import {
  useMessages,
  useInputMessage,
  useSelectedAgentId,
  useCurrentConversationId,
  useIsGenerating,
  useChatActions,
} from '@/hooks/useChatSelectors'
import { useTaskMode, useTaskActions } from '@/hooks/useTaskSelectors'
import { useChatStore } from '@/store/chatStore'
import { useTaskStore } from '@/store/taskStore'

import { useStreamHandler } from './useStreamHandler'

// Dev environment check
const DEBUG = import.meta.env.VITE_DEBUG_MODE === 'true'

// Unified debug log function
const debug = DEBUG
  ? (...args: unknown[]) => logger.debug('[useChatCore]', ...args)
  : () => {}

/**
 * ApiMessage type guard function
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
  /** Handle streaming content callback */
  onChunk?: (chunk: string) => void
  /** New conversation created callback */
  onNewConversation?: (conversationId: string, agentId: string) => void
}

/**
 * Chat core logic Hook
 */
export function useChatCore(options: UseChatCoreOptions = {}) {
  const { t } = useTranslation()
  const { onChunk, onNewConversation } = options

  // Refactored: Hook only manages AbortController
  const abortControllerRef = useRef<AbortController | null>(null)
  
  const conversationMode = useTaskMode() || 'simple'
  
  // Chat store selectors
  const messages = useMessages()
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
  
  const { setMode } = useTaskActions()
  
  const { reset: resetStreamHandler, createChunkHandler } = useStreamHandler()

  /**
   * Stop generation
   */
  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      debug('Stop generation')
      abortControllerRef.current.abort()
    }
  }, [])

  /**
   * Send message core logic
   */
  const sendMessageCore = useCallback(async (
    content?: string,
    overrideAgentId?: string
  ) => {
    // Deduplication: prevent duplicate submissions
    if (isGenerating) {
      debug('Request in progress, ignoring duplicate submission')
      return
    }

    const userContent = (content || inputMessage || '').trim()
    if (!userContent) {
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

    let assistantMessageId: string | undefined

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

      assistantMessageId = generateUUID()
      debug('Preparing to add message, AI ID:', assistantMessageId, 'Type:', typeof assistantMessageId)

      const agentType = getAgentType(normalizedAgentId)
      debug('Agent type:', agentType, 'Agent ID:', normalizedAgentId)

      setMessages([...storeState.messages,
        { role: 'user', content: userContent },
        {
          id: assistantMessageId,
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          metadata: {
            thinking: []
          }
        }
      ])

      setInputMessage('')

      let finalResponseContent = ''
      const storeState2 = useChatStore.getState()
      let actualConversationId = storeState2.currentConversationId || currentConversationId

      debug('Preparing to call sendMessage')

      const handleChunk = createChunkHandler(assistantMessageId, onChunk)

      const streamCallback: StreamCallback = async (
        chunk: string | undefined,
        conversationId?: string,
        _expertEvent?: AnyServerEvent  // 事件处理由 eventHandlers.ts 直接处理，此处保留参数以兼容类型
      ) => {
        if (conversationId && conversationId !== actualConversationId) {
          actualConversationId = conversationId
          setCurrentConversationId(conversationId)
        }

        if (chunk) {
          // 累积完整响应（用于最终保存）
          finalResponseContent += chunk
          
          if (DEBUG) {
            logger.debug('[useChatCore] Received chunk, length:', chunk.length, 'Message ID:', assistantMessageId)
          }
          
          handleChunk(chunk)
        }
      }

      finalResponseContent = await apiSendMessage(
        chatMessages,
        normalizedAgentId,
        streamCallback,
        actualConversationId,
        abortControllerRef.current.signal,
        assistantMessageId
      )

      const storeState3 = useChatStore.getState()
      const initialConversationId = storeState3.currentConversationId
      if (actualConversationId && actualConversationId !== initialConversationId) {
        onNewConversation?.(actualConversationId, selectedAgentId)
      }

      debug(`Task completed, final content length: ${finalResponseContent?.length || 0}`)

      return finalResponseContent

    } catch (error) {
      const isAbortError = 
        (error instanceof Error && error.name === 'AbortError') ||
        (error instanceof Error && error.message?.toLowerCase().includes('abort')) ||
        (error instanceof Error && error.message?.toLowerCase().includes('cancel')) ||
        abortControllerRef.current?.signal.aborted
      
      // 🔐 检测 401 错误，保存消息以便登录后重发
      const isAuthError = (error as any)?.status === 401
      
      if (isAbortError) {
        debug('Request cancelled (user initiated)')
        if (assistantMessageId) {
          updateMessage(assistantMessageId, '', false)
        }
      } else if (isAuthError) {
        // 401 错误：保存消息到 pendingMessage，等待登录后重发
        debug('Authentication error (401), saving message for retry after login')
        useChatStore.getState().setPendingMessage(userContent)
        // 移除刚才添加的用户消息和助手消息（因为实际没有发送成功）
        const currentMessages = useChatStore.getState().messages
        useChatStore.getState().setMessages(currentMessages.slice(0, -2))
      } else {
        errorHandler.handle(error, 'sendMessageCore')

        const userMessage = errorHandler.getUserMessage(error)
        addMessage({
          role: 'assistant',
          content: userMessage
        })
      }
    } finally {
      setGenerating(false)
      abortControllerRef.current = null

      if (conversationMode === 'complex' && assistantMessageId) {
        const currentMessages = useChatStore.getState().messages
        const assistantMsg = currentMessages.find(m => m.id === assistantMessageId)
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
    updateMessage,
    t,
    resetStreamHandler,
    createChunkHandler
  ])

  // Component unmount cleanup
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        debug('Component unmounting, aborting ongoing request')
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
    }
  }, [])

  const resumeExecution = useCallback(async (
    params: ResumeChatParams
  ): Promise<string> => {
    if (isGenerating) {
      debug('Request in progress, ignoring duplicate resume request')
      return ''
    }

    setGenerating(true)
    abortControllerRef.current = new AbortController()

    let fullContent = ''
    
    // 🔥 关键修复：创建助手消息来接收 resume 的流式内容
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
      const streamCallback: StreamCallback = async (
        chunk: string | undefined,
        conversationId?: string,
        _expertEvent?: AnyServerEvent  // 事件处理由 eventHandlers.ts 直接处理
      ) => {
        if (chunk) {
          // 累积完整响应
          fullContent += chunk
          
          handleChunk(chunk)
        }
      }

      fullContent = await apiResumeChat(
        params,
        streamCallback,
        abortControllerRef.current.signal
      )

      return fullContent

    } catch (error) {
      const isAbortError = 
        (error instanceof Error && error.name === 'AbortError') ||
        (error instanceof Error && error.message?.toLowerCase().includes('abort')) ||
        abortControllerRef.current?.signal.aborted

      if (!isAbortError) {
        errorHandler.handle(error, 'resumeExecution')
        addMessage({
          role: 'assistant',
          content: errorHandler.getUserMessage(error)
        })
      }
      
      throw error
    } finally {
      setGenerating(false)
      abortControllerRef.current = null
    }
  }, [isGenerating, conversationMode, onChunk, setGenerating, addMessage, resetStreamHandler, createChunkHandler])

  return {
    sendMessage: sendMessageCore,
    stopGeneration,
    resumeExecution,
    conversationMode,
  }
}
