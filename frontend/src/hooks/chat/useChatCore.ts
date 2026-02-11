/**
 * 聊天核心逻辑 Hook
 * 负责消息发送、停止生成、加载状态管理等核心功能
 * 
 * v3.1.0 性能优化：使用 Zustand Selectors 避免流式输出时的无效重计算
 * v3.1.1 状态机解析：实时分离 thinking 标签和正文内容
 */

import { useCallback, useRef, useEffect, useState } from 'react'
import { 
  sendMessage as apiSendMessage, 
  resumeChat as apiResumeChat,
  type ApiMessage, 
  type StreamCallback,
  type ResumeChatParams
} from '@/services/chat'
import { normalizeAgentId, getAgentType } from '@/utils/agentUtils'
import { generateUUID } from '@/utils'
import { useTranslation } from '@/i18n'
import type { ExpertEvent } from '@/types'
import { errorHandler, logger } from '@/utils/logger'
import { isValidApiMessageRole } from '@/types'

// Performance Optimized Selectors (v3.1.0)
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

// ============================================================================
// v3.1.1: 流式内容状态机解析器
// 用于实时分离 <think> 标签内容和正文内容
// ============================================================================
interface StreamingParserState {
  isInThinking: boolean
  thinkingBuffer: string
  contentBuffer: string
}

/**
 * 处理流式 chunk，分离 thinking 和正文内容
 * 返回 { content: 正文内容, thinking: thinking内容, hasUpdate: 是否有更新 }
 * 
 * v3.1.1 修复：
 * - 只在流的最开始检查 JSON 元数据（避免误杀代码中的 JSON）
 * - 正确处理 chunk 中的标签分割
 */
function processStreamingChunk(
  chunk: string,
  state: StreamingParserState,
  isFirstChunk: boolean = false
): { content: string; thinking: string; hasUpdate: boolean } {
  let outputContent = ''
  let outputThinking = ''
  
  // v3.1.1 修复：只在流的第一个 chunk 检查并过滤系统元数据
  // 避免误杀 AI 回复中的合法 JSON 代码示例
  if (isFirstChunk) {
    const trimmedChunk = chunk.trim()
    
    // 🔥🔥🔥 降噪：使用正则匹配并移除 Router 决策 JSON
    // 匹配 {"decision_type": "complex"} 或 {"decision_type":"complex"}xxx
    const decisionJsonRegex = /^\s*\{\s*"decision_type"\s*:\s*"[^"]+"\s*\}/
    if (decisionJsonRegex.test(trimmedChunk)) {
      // 移除 JSON 部分，保留后面的内容
      chunk = trimmedChunk.replace(decisionJsonRegex, '').trim()
      // 如果移除后没有内容了，直接返回空
      if (!chunk) {
        return { content: '', thinking: '', hasUpdate: false }
      }
    }
    
    // 🔥🔥🔥 降噪：过滤系统日志和工具调用提示
    // 这些不应该展示给用户，只应该在 ThinkingProcess 中显示
    const systemLogPatterns = [
      // Expert thinking 日志
      /^(Expert|专家)\s+\w+\s+(is\s+thinking|thinking|思考中)/i,
      // 工具调用提示
      /^(Calling|调用)\s+(tool|工具)\s*:/i,
      // 原始 Prompt 传递标记
      /^---\s*Prompt\s*---/i,
      /^---\s*System\s*Message\s*---/i,
    ]
    
    for (const pattern of systemLogPatterns) {
      if (pattern.test(trimmedChunk)) {
        // 这是系统日志，过滤掉但标记为 thinking 内容供 ThinkingProcess 使用
        return { content: '', thinking: trimmedChunk, hasUpdate: true }
      }
    }
  }
  
  // 状态机解析
  let i = 0
  while (i < chunk.length) {
    const remainingChunk = chunk.slice(i)
    
    if (!state.isInThinking) {
      // 不在 thinking 标签内，检查是否进入
      const thinkStart = remainingChunk.indexOf('<think>')
      const thoughtStart = remainingChunk.indexOf('<thought>')
      
      const nextTagStart = thinkStart !== -1 ? thinkStart : thoughtStart
      const actualTagStart = thoughtStart !== -1 && (thinkStart === -1 || thoughtStart < thinkStart) 
        ? thoughtStart 
        : nextTagStart
      
      if (actualTagStart !== -1) {
        // 找到标签开始，之前的内容是正文
        outputContent += remainingChunk.slice(0, actualTagStart)
        state.isInThinking = true
        i += actualTagStart + (actualTagStart === thinkStart ? 7 : 9) // <think> 或 <thought> 的长度
      } else {
        // 没有标签，全部作为正文
        outputContent += remainingChunk
        break
      }
    } else {
      // 在 thinking 标签内，检查是否退出
      const thinkEnd = remainingChunk.indexOf('</think>')
      const thoughtEnd = remainingChunk.indexOf('</thought>')
      
      const nextTagEnd = thinkEnd !== -1 ? thinkEnd : thoughtEnd
      const actualTagEnd = thoughtEnd !== -1 && (thinkEnd === -1 || thoughtEnd < thinkEnd) 
        ? thoughtEnd 
        : nextTagEnd
      
      if (actualTagEnd !== -1) {
        // 找到标签结束，之前的内容是 thinking
        outputThinking += remainingChunk.slice(0, actualTagEnd)
        state.isInThinking = false
        i += actualTagEnd + (actualTagEnd === thinkEnd ? 8 : 10) // </think> 或 </thought> 的长度
      } else {
        // 没有结束标签，全部作为 thinking
        outputThinking += remainingChunk
        break
      }
    }
  }
  
  // 更新状态缓冲
  state.contentBuffer += outputContent
  state.thinkingBuffer += outputThinking
  
  return {
    content: outputContent,
    thinking: outputThinking,
    hasUpdate: outputContent.length > 0 || outputThinking.length > 0
  }
}

/**
 * 重置解析器状态
 */
function resetStreamingParser(state: StreamingParserState): void {
  state.isInThinking = false
  state.thinkingBuffer = ''
  state.contentBuffer = ''
}

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
  /** Handle expert event callback */
  onExpertEvent?: (event: ExpertEvent, conversationMode: 'simple' | 'complex') => Promise<void> | void
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
  const { onExpertEvent, onChunk, onNewConversation } = options

  // Refactored: Hook only manages AbortController
  const abortControllerRef = useRef<AbortController | null>(null)
  
  // Performance Optimized Selectors (v3.1.0)
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
    updateMessageMetadata,
    setMessages, 
    setGenerating 
  } = useChatActions()
  
  const { setMode } = useTaskActions()

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
    
    // v3.1.1: 初始化流式解析器状态
    const streamingParserState: StreamingParserState = {
      isInThinking: false,
      thinkingBuffer: '',
      contentBuffer: ''
    }

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

      // 🔥 只有系统智能体才创建 router thinking 步骤
      // 自定义智能体直接走 LLM，不经过 LangGraph Router
      const initialThinking = agentType === 'system' ? [{
        id: generateUUID(),
        expertType: 'router',
        expertName: '智能路由',
        content: '正在分析意图，选择执行模式...',
        timestamp: new Date().toISOString(),
        status: 'running' as const,
        type: 'analysis' as const
      }] : []

      setMessages([...storeState.messages,
        { role: 'user', content: userContent },
        {
          id: assistantMessageId,
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          metadata: {
            thinking: initialThinking
          }
        }
      ])

      setInputMessage('')

      let finalResponseContent = ''
      const storeState2 = useChatStore.getState()
      let actualConversationId = storeState2.currentConversationId || currentConversationId

      debug('Preparing to call sendMessage')

      let hasProcessedComplexMode = false
      let isFirstChunk = true  // v3.1.1: 标记是否是第一个 chunk

      const streamCallback: StreamCallback = async (
        chunk: string | undefined,
        conversationId?: string,
        expertEvent?: ExpertEvent
      ) => {
        if (conversationId && conversationId !== actualConversationId) {
          actualConversationId = conversationId
          setCurrentConversationId(conversationId)
        }

        if (expertEvent) {
          onExpertEvent?.(expertEvent as any, conversationMode)
        }

        if (chunk) {
          // v3.1.1: 使用状态机解析器分离 thinking 和正文内容
          const { content, thinking } = processStreamingChunk(chunk, streamingParserState, isFirstChunk)
          
          // 标记第一个 chunk 已处理
          if (isFirstChunk) {
            isFirstChunk = false
          }
          
          // 累积完整响应（包括 thinking，用于最终保存）
          finalResponseContent += chunk
          
          if (DEBUG) {
            logger.debug('[useChatCore] Received chunk, raw:', chunk.length, 'content:', content.length, 'thinking:', thinking.length, 'Message ID:', assistantMessageId)
          }
          
          // 只将正文内容传递给 UI 显示
          if (content) {
            onChunk?.(content)
            
            // 🔥 关键修复：实时更新消息内容到 chatStore
            if (assistantMessageId) {
              updateMessage(assistantMessageId, content, true)
            }
          }
          
          // 如果有 thinking 内容，实时更新到消息 metadata
          // 🔥 使用累积的 thinkingBuffer 而不是本次 chunk 的 thinking
          if (streamingParserState.thinkingBuffer && assistantMessageId) {
            updateMessageMetadata(assistantMessageId, {
              thinking: [{
                id: 'streaming-think',
                expertType: 'thinking',
                expertName: '思考过程',
                content: streamingParserState.thinkingBuffer,
                timestamp: new Date().toISOString(),
                status: 'running',
                type: 'default'
              }]
            })
          }
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
      if (actualConversationId !== initialConversationId) {
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
      
      if (isAbortError) {
        debug('Request cancelled (user initiated)')
        if (assistantMessageId) {
          updateMessage(assistantMessageId, '', false)
        }
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
    onExpertEvent,
    onChunk,
    onNewConversation,
    setGenerating,
    setMode,
    setMessages,
    setInputMessage,
    setCurrentConversationId,
    addMessage,
    updateMessage,
    t
  ])

  // Page visibility and lifecycle management
  const isPageHiddenRef = useRef(false)
  
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        isPageHiddenRef.current = true
        debug('Page hidden, keeping SSE connection')
      } else {
        isPageHiddenRef.current = false
        debug('Page visible, resuming UI updates')
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (abortControllerRef.current) {
        debug('Component unmounting, aborting ongoing request')
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
    }
  }, [])

  /**
   * v3.1.0 HITL: Resume interrupted execution flow
   */
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
    
    // v3.1.1: 初始化流式解析器状态
    const streamingParserState: StreamingParserState = {
      isInThinking: false,
      thinkingBuffer: '',
      contentBuffer: ''
    }
    let isFirstChunk = true  // v3.1.1: 标记是否是第一个 chunk

    try {
      const streamCallback: StreamCallback = async (
        chunk: string | undefined,
        conversationId?: string,
        expertEvent?: ExpertEvent
      ) => {
        if (expertEvent) {
          onExpertEvent?.(expertEvent as any, conversationMode)
        }

        if (chunk) {
          // v3.1.1: 使用状态机解析器分离 thinking 和正文内容
          const { content, thinking } = processStreamingChunk(chunk, streamingParserState, isFirstChunk)
          
          // 标记第一个 chunk 已处理
          if (isFirstChunk) {
            isFirstChunk = false
          }
          
          // 累积完整响应
          fullContent += chunk
          
          // 只将正文内容传递给 UI 显示
          if (content) {
            onChunk?.(content)
          }
          
          // 🔥 关键修复：使用累积的 thinkingBuffer 更新到消息 metadata
          // resumeExecution 不直接更新消息内容，由上层通过 onChunk 处理
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
  }, [isGenerating, conversationMode, onExpertEvent, onChunk, setGenerating, addMessage])

  return {
    sendMessage: sendMessageCore,
    stopGeneration,
    resumeExecution,
    conversationMode,
  }
}
