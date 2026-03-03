/**
 * useStreamHandler - 流式消息处理器
 * 
 * 采用工厂模式封装流式解析逻辑，消除 sendMessageCore 和 resumeExecution 的代码重复
 * 
 * 设计原则：
 * - 解析状态用 Ref 存储，避免触发重渲染
 * - createChunkHandler 工厂方法支持动态 messageId 绑定
 * - 保持 processStreamingChunk 作为纯函数，便于测试
 * - 使用 RAF 批量更新，减少 store 更新频率（P0 优化）
 */

import { useRef, useCallback, useEffect } from 'react'
import { useChatActions } from '@/hooks/useChatSelectors'

// ============================================================================
// 解析器状态定义
// ============================================================================

interface StreamingParserState {
  isInThinking: boolean
  thinkingBuffer: string
  contentBuffer: string
}

interface PendingUpdate {
  contentDelta: string
  thinkingBuffer: string
}

// ============================================================================
// 纯函数：流式内容解析（可独立测试）
// ============================================================================

/**
 * 处理流式 chunk，分离 thinking 和正文内容
 * 返回 { content: 正文内容, thinking: thinking内容, hasUpdate: 是否有更新 }
 */
function processStreamingChunk(
  chunk: string,
  state: StreamingParserState,
  isFirstChunk: boolean = false
): { content: string; thinking: string; hasUpdate: boolean } {
  let outputContent = ''
  let outputThinking = ''
  
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

// ============================================================================
// Hook：流式处理器工厂
// ============================================================================

export function useStreamHandler() {
  const { updateMessage, updateMessageMetadata } = useChatActions()
  
  // 使用 Ref 存储解析状态，避免触发重渲染
  const parserRef = useRef<StreamingParserState>({
    isInThinking: false,
    thinkingBuffer: '',
    contentBuffer: ''
  })
  
  // 标记是否是第一个 chunk（用于某些特殊处理）
  const isFirstChunkRef = useRef(true)
  
  // 🔥 稳定的 thinking ID，避免每次 chunk 都生成新 ID 导致组件频繁重创建
  const thinkingIdRef = useRef<string>('')
  
  // ============================================================================
  // P0 优化：RAF 批量更新机制
  // ============================================================================
  
  /** 待更新的内容缓冲 */
  const pendingUpdateRef = useRef<PendingUpdate>({ contentDelta: '', thinkingBuffer: '' })
  /** RAF 回调 ID */
  const rafIdRef = useRef<number | null>(null)
  /** 当前处理的消息 ID */
  const currentMessageIdRef = useRef<string>('')
  /** 可选的 chunk 回调 */
  const onChunkRef = useRef<((content: string) => void) | undefined>(undefined)
  
  /**
   * 执行批量更新
   * 将缓冲的内容一次性应用到 store
   */
  const flushUpdates = useCallback(() => {
    const pending = pendingUpdateRef.current
    const messageId = currentMessageIdRef.current
    
    if (!messageId) {
      rafIdRef.current = null
      return
    }
    
    // 批量更新消息内容
    if (pending.contentDelta) {
      updateMessage(messageId, pending.contentDelta, true)
      onChunkRef.current?.(pending.contentDelta)
    }
    
    // 批量更新 thinking 内容
    if (pending.thinkingBuffer && thinkingIdRef.current) {
      updateMessageMetadata(messageId, {
        thinking: [{
          id: thinkingIdRef.current,
          expertType: 'thinking',
          expertName: '思考过程',
          content: pending.thinkingBuffer,
          timestamp: new Date().toISOString(),
          status: 'running',
          type: 'default'
        }]
      })
    }
    
    // 清空缓冲
    pendingUpdateRef.current = { contentDelta: '', thinkingBuffer: '' }
    rafIdRef.current = null
  }, [updateMessage, updateMessageMetadata])
  
  /**
   * 调度批量更新
   * 使用 RAF 合并同一帧内的多次更新
   */
  const scheduleUpdate = useCallback((content: string, thinkingBuffer: string) => {
    // 累加到缓冲
    pendingUpdateRef.current.contentDelta += content
    pendingUpdateRef.current.thinkingBuffer = thinkingBuffer
    
    // 如果已有 RAF 调度，等待执行；否则调度新的
    if (rafIdRef.current === null) {
      rafIdRef.current = requestAnimationFrame(flushUpdates)
    }
  }, [flushUpdates])
  
  /**
   * 强制刷新所有待更新内容
   * 在流式结束时调用，确保最后的内容被应用
   */
  const forceFlush = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = null
    }
    flushUpdates()
  }, [flushUpdates])
  
  // 组件卸载时清理 RAF
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
    }
  }, [])
  
  /**
   * 重置解析器状态
   * 每次开始新的流式会话前调用
   */
  const reset = useCallback(() => {
    // 先刷新之前的更新
    forceFlush()
    
    // 重置解析状态
    parserRef.current = {
      isInThinking: false,
      thinkingBuffer: '',
      contentBuffer: ''
    }
    isFirstChunkRef.current = true
    
    // 重置 thinking ID，下次使用时生成新的
    thinkingIdRef.current = ''
    
    // 重置消息 ID 和回调
    currentMessageIdRef.current = ''
    onChunkRef.current = undefined
    pendingUpdateRef.current = { contentDelta: '', thinkingBuffer: '' }
  }, [forceFlush])
  
  /**
   * 工厂方法：创建特定消息的处理器
   * 
   * @param messageId - 要更新的消息 ID（动态绑定）
   * @param onChunk - 可选的回调，用于额外的 UI 更新
   * @returns 处理单个 chunk 的函数
   */
  const createChunkHandler = useCallback((
    messageId: string, 
    onChunk?: (content: string) => void
  ) => {
    // 🔥 生成稳定的 thinking ID（基于 messageId，确保同一消息的所有 chunk 使用相同 ID）
    if (!thinkingIdRef.current) {
      thinkingIdRef.current = `streaming-think-${messageId}`
    }
    const stableThinkingId = thinkingIdRef.current
    
    // 保存消息 ID 和回调到 ref
    currentMessageIdRef.current = messageId
    onChunkRef.current = onChunk
    
    return (chunk: string) => {
      // 解析 chunk
      const { content } = processStreamingChunk(
        chunk, 
        parserRef.current, 
        isFirstChunkRef.current
      )
      
      // 标记第一个 chunk 已处理
      if (isFirstChunkRef.current) {
        isFirstChunkRef.current = false
      }
      
      // P0 优化：使用 RAF 批量更新，替代直接 store 更新
      if (content || parserRef.current.thinkingBuffer) {
        scheduleUpdate(content, parserRef.current.thinkingBuffer)
      }
    }
  }, [scheduleUpdate])
  
  return { 
    reset, 
    createChunkHandler,
    forceFlush,  // 暴露强制刷新方法，供流式结束时调用
    // 暴露获取当前状态的方法（用于调试）
    getState: () => ({
      parser: parserRef.current,
      pending: pendingUpdateRef.current,
      hasScheduledUpdate: rafIdRef.current !== null
    })
  }
}

export type { StreamingParserState, PendingUpdate }
export { processStreamingChunk }
