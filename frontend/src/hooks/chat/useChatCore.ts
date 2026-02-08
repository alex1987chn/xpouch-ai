/**
 * 聊天核心逻辑 Hook
 * 负责消息发送、停止生成、加载状态管理等核心功能
 */

import { useCallback, useRef, useEffect, useState } from 'react'
import { sendMessage as apiSendMessage, type ApiMessage, type StreamCallback } from '@/services/chat'
import { useChatStore } from '@/store/chatStore'
import { useTaskStore } from '@/store/taskStore'
import { normalizeAgentId } from '@/utils/agentUtils'
import { generateUUID } from '@/utils'
import { useTranslation } from '@/i18n'
import type { ExpertEvent } from '@/types'
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
  const { onExpertEvent, onChunk, onNewConversation } = options

  // ✅ 重构：状态提升到 Store，Hook 只管理 AbortController
  const abortControllerRef = useRef<AbortController | null>(null)
  
  // 👈 从 taskStore 读取对话模式（由后端 Router 决策决定）
  const conversationMode = useTaskStore(state => state.mode) || 'simple'

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
    setMessages,
    isGenerating,        // ✅ 从 Store 读取
    setGenerating,       // ✅ 从 Store 读取
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
    if (isGenerating) {
      debug('请求正在进行中，忽略重复提交')
      return
    }

    // 👈 修复：优先使用传入的 content 参数（如从首页跳转时），其次才使用 store 的 inputMessage
    const userContent = (content || inputMessage || '').trim()
    if (!userContent) {
      debug('消息内容为空，跳过发送')
      return
    }

    setGenerating(true)  // ✅ 使用 Store 方法
    
    // 👈 重置 taskStore 的 mode，等待后端 Router 决策
    useTaskStore.getState().setMode('simple')

    // 优先使用传入的 agentId，否则使用 store 中的 selectedAgentId
    const agentId = overrideAgentId || selectedAgentId
    if (!agentId) {
      logger.error('[useChatCore] 未选择智能体')
      setGenerating(false)  // ✅ 使用 Store 方法
      return
    }
    const normalizedAgentId = normalizeAgentId(agentId)

    // 创建新的 AbortController
    abortControllerRef.current = new AbortController()

    let assistantMessageId: string | undefined

    try {
      // 1. 准备请求数据 - 使用 getState() 获取最新的 messages，避免闭包捕获旧值
      const storeState = useChatStore.getState()
      // 🔥 修复：过滤掉 content 为 undefined 的历史消息，并确保类型正确
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

      debug('准备发送消息，历史消息数:', storeState.messages.length, '当前输入:', userContent)

      // 2. 添加用户消息和 AI 消息占位符
      // 👈 v3.1: 简单模式预先创建 AI 消息，复杂模式也创建占位符（用于关联 events）
      assistantMessageId = generateUUID()
      debug('准备添加消息，AI ID:', assistantMessageId, '类型:', typeof assistantMessageId)

      // 👈 关键修复：使用 setMessages 批量更新，避免中间件延迟
      setMessages([...storeState.messages,
        { role: 'user', content: userContent },
        { id: assistantMessageId, role: 'assistant', content: '', timestamp: Date.now() }
      ])

      setInputMessage('')
      setIsTyping(true)

      // 4. 发送请求并处理流式响应
      let finalResponseContent = ''
      // 👈 使用 getState() 获取最新的 currentConversationId，避免闭包捕获旧值
      const storeState2 = useChatStore.getState()
      let actualConversationId = storeState2.currentConversationId || currentConversationId

      debug('准备调用 sendMessage')
      // ✅ 移除：状态已在函数开头设置

      // 👈 用于防止重复处理 complex 模式
      let hasProcessedComplexMode = false

      const streamCallback: StreamCallback = async (
        chunk: string | undefined,
        conversationId?: string,
        expertEvent?: ExpertEvent
        // ⚠️ artifact 和 expertId 已合并到 expertCompleted 事件中处理
        // artifact?: Artifact,
        // expertId?: string
      ) => {
        // 更新 conversationId
        if (conversationId && conversationId !== actualConversationId) {
          actualConversationId = conversationId
          setCurrentConversationId(conversationId)
        }

        // v3.0: 处理新协议事件
        if (expertEvent) {
          onExpertEvent?.(expertEvent as any, conversationMode)
        }

        // 实时更新流式内容
        if (chunk) {
          finalResponseContent += chunk

          if (DEBUG) {
            logger.debug('[useChatCore] 收到chunk，长度:', chunk.length, '总长度:', finalResponseContent.length, '消息ID:', assistantMessageId)
          }

          // 调用外部 onChunk 回调
          onChunk?.(chunk)
        }
      }

      finalResponseContent = await apiSendMessage(
        chatMessages,
        normalizedAgentId,
        streamCallback,
        actualConversationId,
        abortControllerRef.current.signal,
        assistantMessageId  // v3.0: 传递前端生成的助手消息 ID
      )

      // ✅ 移除：在 finally 中统一处理

      // 6. 更新 URL 中的 conversationId（通过回调）
      const storeState3 = useChatStore.getState()
      const initialConversationId = storeState3.currentConversationId
      if (actualConversationId !== initialConversationId) {
        onNewConversation?.(actualConversationId, selectedAgentId)
      }

      // 7. 更新最终响应到助手消息
      // 🔥 修复：不再替换为友好文案，显示实际的聚合报告
      // 流式内容由 eventHandlers.ts 的 handleMessageDelta 处理
      debug(`任务完成，最终内容长度: ${finalResponseContent?.length || 0}`)

      return finalResponseContent

    } catch (error) {
      // 👈 检查是否是用户手动取消（多种判断方式）
      const isAbortError = 
        (error instanceof Error && error.name === 'AbortError') ||
        (error instanceof Error && error.message?.toLowerCase().includes('abort')) ||
        (error instanceof Error && error.message?.toLowerCase().includes('cancel')) ||
        abortControllerRef.current?.signal.aborted
      
      if (isAbortError) {
        debug('请求已取消（用户主动停止）')
        // 移除空的 AI 消息
        if (assistantMessageId) {
          updateMessage(assistantMessageId, '', false)
        }
      } else {
        // 使用统一的错误处理器
        errorHandler.handle(error, 'sendMessageCore')

        // 添加错误消息到聊天
        const userMessage = errorHandler.getUserMessage(error)
        addMessage({
          role: 'assistant',
          content: userMessage
        })
      }
    } finally {
      setIsTyping(false)
      setGenerating(false)  // ✅ 使用 Store 方法
      abortControllerRef.current = null

      // 👈 v3.1: 复杂模式下，等待 aggregator 完成后再决定是否清理空消息
      // 修复：aggregator 会发送 message.delta 事件来填充消息内容，不要提前删除
      // 只有在确定没有 aggregator 事件的情况下才清理
      if (conversationMode === 'complex' && assistantMessageId) {
        const currentMessages = useChatStore.getState().messages
        const assistantMsg = currentMessages.find(m => m.id === assistantMessageId)
        // 只有当消息为空且已经过了一段时间（aggregator 应该已完成）才删除
        // 这里我们依赖 message.done 事件来标记完成，所以不在这里删除
        if (assistantMsg && !assistantMsg.content?.trim()) {
          // 不删除消息，保留空消息等待 aggregator 填充
          // 或者添加一个占位符文本
          debug('复杂模式：保留空 AI 消息等待 aggregator 总结', assistantMessageId)
        }
      }
    }
  }, [
    isGenerating,
    messages,
    inputMessage,
    selectedAgentId,
    currentConversationId,
    conversationMode,
    onExpertEvent,
    onChunk,
    onNewConversation,
    setGenerating,
    setIsTyping,
    t
  ])

  // 👈 页面可见性和生命周期管理
  const isPageHiddenRef = useRef(false)
  
  useEffect(() => {
    // 页面可见性变化处理
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // 页面隐藏：只标记状态，不关闭连接
        isPageHiddenRef.current = true
        debug('页面隐藏，保持 SSE 连接')
      } else {
        // 页面显示：恢复更新
        isPageHiddenRef.current = false
        debug('页面显示，恢复 UI 更新')
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      // 组件真正卸载时才中止请求
      if (abortControllerRef.current) {
        debug('组件卸载，中止正在进行的请求')
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
    }
  }, [])

  return {
    // ✅ 重构：Hook 只返回方法，状态从 Store 直接读取
    sendMessage: sendMessageCore,
    stopGeneration,
    // 👈 返回对话模式，供上层组件使用
    conversationMode,
  }
}
