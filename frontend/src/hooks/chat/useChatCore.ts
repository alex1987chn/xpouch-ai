/**
 * 聊天核心逻辑 Hook
 * 负责消息发送、停止生成、加载状态管理等核心功能
 * 
 * v3.1.0 性能优化：使用 Zustand Selectors 避免流式输出时的无效重计算
 * v3.1.0 状态机解析：实时分离 thinking 标签和正文内容
 * v3.1.0 重构：提取 useStreamHandler，消除 sendMessageCore 和 resumeExecution 的代码重复
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
import { useTaskStore } from '@/store/taskStore'

// ============================================================================
// Phase 2: ExecutionStore 集成 - Server-Driven UI 事件分发
// ============================================================================
import { useExecutionStore } from '@/store/executionStore'
import type { 
  RouterDecisionEvent, 
  PlanThinkingEvent,
  TaskStartedEvent,
  TaskCompletedEvent,
  HumanInterruptEvent,
  AnyServerEvent
} from '@/types/events'

// ============================================================================
// v3.1.0: 流式处理器 Hook - 消除代码重复
// ============================================================================
import { useStreamHandler } from './useStreamHandler'

// Dev environment check
const DEBUG = import.meta.env.VITE_DEBUG_MODE === 'true'

// Unified debug log function
const debug = DEBUG
  ? (...args: unknown[]) => logger.debug('[useChatCore]', ...args)
  : () => {}

// ============================================================================
// Phase 2: Server-Driven UI 事件分发器
// 将 SSE 事件映射到 ExecutionStore 状态机
// ============================================================================

/**
 * 分发 SSE 事件到 ExecutionStore
 * 遵循 Server-Driven UI 原则：后端推送事件，前端只更新状态
 */
function dispatchEventToExecutionStore(event: AnyServerEvent): void {
  const { 
    setStatus, 
    setExpert, 
    appendThinking, 
    setPlan, 
    setProgress,
    reset 
  } = useExecutionStore.getState()

  switch (event.type) {
    // Router 决策阶段
    case 'router.decision': {
      const data = (event as RouterDecisionEvent).data
      // 根据决策设置状态
      if (data.decision === 'complex') {
        setStatus('planning')
      } else {
        // Simple 模式下，如果正在生成，直接跳到 executing
        setStatus('executing')
      }
      break
    }

    // 规划思考阶段
    case 'plan.thinking': {
      const data = (event as PlanThinkingEvent).data
      appendThinking(data.delta)
      break
    }

    // 任务开始 - 进入执行阶段
    case 'task.started': {
      const data = (event as TaskStartedEvent).data
      setStatus('executing')
      setExpert({
        id: data.task_id,
        name: data.expert_type,
        type: data.expert_type,
      })
      appendThinking(`[${data.expert_type}] 开始执行: ${data.description}`)
      break
    }

    // 任务完成
    case 'task.completed': {
      const data = (event as TaskCompletedEvent).data
      appendThinking(`[${data.expert_type}] 执行完成，耗时 ${data.duration_ms}ms`)
      // 清空当前专家（任务完成后）
      setExpert(null)
      break
    }

    // HITL 中断 - 等待用户审核
    case 'human.interrupt': {
      const data = (event as HumanInterruptEvent).data
      setStatus('reviewing')
      if (data.current_plan) {
        const plan = data.current_plan.map((t: any) => ({
          id: t.id,
          expertType: t.expert_type,
          description: t.description,
          status: t.status,
          dependencies: t.depends_on || [] // 🔥 使用后端传来的实际依赖关系
        }))
        setPlan(plan)
        setProgress({ current: 0, total: data.current_plan.length })
        
        // 🔥🔥🔥 关键修复：同步到 TaskStore，避免双 Store 脑裂
        // 将 plan 转换为 TaskStore 的格式并强制覆盖
        const { initializePlan } = useTaskStore.getState()
        initializePlan({
          session_id: data.thread_id || 'unknown',
          summary: data.message || '任务规划等待审核',
          estimated_steps: data.current_plan.length,
          tasks: data.current_plan.map((t: any, index: number) => ({
            id: t.id,
            task_id: t.id,
            expert_type: t.expert_type,
            description: t.description,
            status: t.status || 'pending',
            sort_order: t.sort_order ?? index,
            depends_on: t.depends_on || [],
          }))
        })
      }
      break
    }

    // 流程完成
    case 'workflow.completed':
      setStatus('completed')
      setExpert(null)
      break

    // 流程错误/取消
    case 'error':
    case 'workflow.cancelled':
      setStatus('idle')
      setExpert(null)
      break

    default:
      // 其他事件不处理
      break
  }
}

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
  onExpertEvent?: (event: AnyServerEvent, conversationMode: 'simple' | 'complex') => Promise<void> | void
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
    setMessages, 
    setGenerating 
  } = useChatActions()
  
  const { setMode } = useTaskActions()
  
  // Phase 2: ExecutionStore Actions
  const { reset: resetExecutionStore } = useExecutionStore.getState()
  
  // v3.2.0: 流式处理器 - 消除代码重复
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
    
    // Phase 2: Reset ExecutionStore for new workflow
    resetExecutionStore()
    
    // Reset taskStore mode, wait for backend Router decision
    setMode('simple')
    
    // v3.1.0: 重置流式处理器
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

      // v3.1.0: 创建 chunk 处理器（绑定 messageId）
      const handleChunk = createChunkHandler(assistantMessageId, onChunk)

      const streamCallback: StreamCallback = async (
        chunk: string | undefined,
        conversationId?: string,
        expertEvent?: AnyServerEvent
      ) => {
        if (conversationId && conversationId !== actualConversationId) {
          actualConversationId = conversationId
          setCurrentConversationId(conversationId)
        }

        if (expertEvent) {
          onExpertEvent?.(expertEvent as any, conversationMode)
          
          // Phase 2: 分发事件到 ExecutionStore
          dispatchEventToExecutionStore(expertEvent)
        }

        if (chunk) {
          // 累积完整响应（用于最终保存）
          finalResponseContent += chunk
          
          if (DEBUG) {
            logger.debug('[useChatCore] Received chunk, length:', chunk.length, 'Message ID:', assistantMessageId)
          }
          
          // v3.1.0: 使用工厂方法处理 chunk
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
    t,
    resetExecutionStore,
    resetStreamHandler,
    createChunkHandler
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
    
    // v3.1.0: 重置流式处理器
    resetStreamHandler()
    
    // v3.1.0: 创建 chunk 处理器（绑定 messageId）
    const handleChunk = createChunkHandler(assistantMessageId, onChunk)

    try {
      const streamCallback: StreamCallback = async (
        chunk: string | undefined,
        conversationId?: string,
        expertEvent?: AnyServerEvent
      ) => {
        if (expertEvent) {
          onExpertEvent?.(expertEvent as any, conversationMode)
          
          // Phase 2: 分发事件到 ExecutionStore
          dispatchEventToExecutionStore(expertEvent)
        }

        if (chunk) {
          // 累积完整响应
          fullContent += chunk
          
          // v3.1.0: 使用工厂方法处理 chunk
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
  }, [isGenerating, conversationMode, onExpertEvent, onChunk, setGenerating, addMessage, resetStreamHandler, createChunkHandler])

  return {
    sendMessage: sendMessageCore,
    stopGeneration,
    resumeExecution,
    conversationMode,
  }
}
