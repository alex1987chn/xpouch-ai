/**
 * useStreamHandler - 流式消息处理器
 * 
 * 采用工厂模式封装流式解析逻辑，消除 sendMessageCore 和 resumeExecution 的代码重复
 * 
 * 设计原则：
 * - 解析状态用 Ref 存储，避免触发重渲染
 * - createChunkHandler 工厂方法支持动态 messageId 绑定
 * - 保持 processStreamingChunk 作为纯函数，便于测试
 * 
 * v3.1.0 重构：提取公共流式处理逻辑
 */

import { useRef, useCallback } from 'react'
import { useChatActions } from '@/hooks/useChatSelectors'
import { useExecutionActions } from '@/store/executionStore'

// ============================================================================
// 解析器状态定义
// ============================================================================

interface StreamingParserState {
  isInThinking: boolean
  thinkingBuffer: string
  contentBuffer: string
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
  const { appendThinking } = useExecutionActions()
  
  // 使用 Ref 存储解析状态，避免触发重渲染
  const parserRef = useRef<StreamingParserState>({
    isInThinking: false,
    thinkingBuffer: '',
    contentBuffer: ''
  })
  
  // 标记是否是第一个 chunk（用于某些特殊处理）
  const isFirstChunkRef = useRef(true)
  
  /**
   * 重置解析器状态
   * 每次开始新的流式会话前调用
   */
  const reset = useCallback(() => {
    parserRef.current = {
      isInThinking: false,
      thinkingBuffer: '',
      contentBuffer: ''
    }
    isFirstChunkRef.current = true
  }, [])
  
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
    return (chunk: string) => {
      // 解析 chunk
      const { content, thinking } = processStreamingChunk(
        chunk, 
        parserRef.current, 
        isFirstChunkRef.current
      )
      
      // 标记第一个 chunk 已处理
      if (isFirstChunkRef.current) {
        isFirstChunkRef.current = false
      }
      
      // 更新消息内容（正文部分）
      if (content) {
        updateMessage(messageId, content, true)
        onChunk?.(content)
      }
      
      // 更新 thinking 内容到 metadata
      if (parserRef.current.thinkingBuffer) {
        appendThinking(thinking)
        updateMessageMetadata(messageId, {
          thinking: [{
            id: `streaming-think-${Date.now()}`,
            expertType: 'thinking',
            expertName: '思考过程',
            content: parserRef.current.thinkingBuffer,
            timestamp: new Date().toISOString(),
            status: 'running',
            type: 'default'
          }]
        })
      }
    }
  }, [updateMessage, updateMessageMetadata, appendThinking])
  
  return { 
    reset, 
    createChunkHandler,
    // 暴露获取当前状态的方法（用于调试）
    getState: () => parserRef.current 
  }
}

export type { StreamingParserState }
export { processStreamingChunk }
