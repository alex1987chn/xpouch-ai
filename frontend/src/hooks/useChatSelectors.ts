/**
 * ChatStore 性能优化 Selectors
 * 
 * 使用 Zustand Selector 模式避免不必要的重渲染
 * 特别优化流式输出场景下的性能
 */

import { useShallow } from 'zustand/react/shallow'
import { useChatStore } from '@/store/chatStore'
import type { Message } from '@/types'

// ============================================================================
// 基础 Selectors (返回原始值)
// ============================================================================

/** 获取当前会话ID */
export const useCurrentConversationId = () => 
  useChatStore(state => state.currentConversationId)

/** 获取输入框消息 */
export const useInputMessage = () => 
  useChatStore(state => state.inputMessage)

/** 获取生成状态 */
export const useIsGenerating = () => 
  useChatStore(state => state.isGenerating)



/** 获取选中的智能体ID */
export const useSelectedAgentId = () => 
  useChatStore(state => state.selectedAgentId)

// ============================================================================
// 复杂 Selectors (使用 useShallow)
// ============================================================================

/** 
 * 获取消息列表
 * 使用 useShallow 避免数组引用变化导致的重渲染
 */
export const useMessages = () => useChatStore(
  useShallow(state => state.messages)
)

/**
 * 获取最后一条消息
 * 常用于流式输出时跟踪最新消息
 */
export const useLastMessage = (): Message | undefined => useChatStore(
  useShallow(state => {
    const { messages } = state
    return messages.length > 0 ? messages[messages.length - 1] : undefined
  })
)

/**
 * 获取最后一条助手消息
 * 用于更新 thinking 步骤
 */
export const useLastAssistantMessage = (): Message | undefined => useChatStore(
  useShallow(state => {
    const { messages } = state
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') {
        return messages[i]
      }
    }
    return undefined
  })
)

/**
 * 获取自定义智能体列表
 */
export const useCustomAgents = () => useChatStore(
  useShallow(state => state.customAgents)
)

// ============================================================================
// Actions Selectors (稳定引用)
// ============================================================================

/**
 * 获取所有 Actions
 * 使用 useShallow 确保返回的对象引用稳定
 */
export const useChatActions = () => useChatStore(
  useShallow(state => ({
    setMessages: state.setMessages,
    addMessage: state.addMessage,
    updateMessage: state.updateMessage,
    updateMessageMetadata: state.updateMessageMetadata,
    setInputMessage: state.setInputMessage,
    setCurrentConversationId: state.setCurrentConversationId,
    setSelectedAgentId: state.setSelectedAgentId,
    setGenerating: state.setGenerating,
  }))
)

/**
 * 获取单个 Action (性能最优，只订阅单个函数)
 */
export const useAddMessageAction = () => 
  useChatStore(state => state.addMessage)

export const useUpdateMessageAction = () => 
  useChatStore(state => state.updateMessage)

export const useSetGeneratingAction = () => 
  useChatStore(state => state.setGenerating)

export const useSetInputMessageAction = () => 
  useChatStore(state => state.setInputMessage)

// ============================================================================
// 派生 Selectors (计算值)
// ============================================================================

/**
 * 获取消息统计
 */
export const useMessageStats = () => useChatStore(
  useShallow(state => ({
    total: state.messages.length,
    isGenerating: state.isGenerating,
    hasConversation: !!state.currentConversationId,
  }))
)

/**
 * 检查是否有消息
 */
export const useHasMessages = () => 
  useChatStore(state => state.messages.length > 0)

/**
 * 获取消息数量
 */
export const useMessageCount = () => 
  useChatStore(state => state.messages.length)
