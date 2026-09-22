/**
 * ChatStore 性能优化 Selectors
 * 
 * 使用 Zustand Selector 模式避免不必要的重渲染
 * 特别优化流式输出场景下的性能
 */

import { useShallow } from 'zustand/react/shallow'
import { useMemo } from 'react'
import { useChatStore } from '@/store/chatStore'

// ============================================================================
// 基础 Selectors (返回原始值)
// ============================================================================

/** 获取当前会话ID */
export const useCurrentThreadId = () => 
  useChatStore(state => state.currentThreadId)

/** 获取输入框消息 */
export const useInputMessage = () => 
  useChatStore(state => state.inputMessage)

/** 获取生成状态 */
export const useIsGenerating = () => 
  useChatStore(state => state.isGenerating)



/** 获取消息列表
 * 使用 useShallow 避免数组引用变化导致的重渲染
 */
export const useMessages = () => useChatStore(
  useShallow(state => state.messages)
)

// （useCustomAgents 已删除——智能体列表唯一真相是 useAgentsQuery）

// ============================================================================
// Actions Selectors (稳定引用)
// ============================================================================

/**
 * 获取所有 Actions
 * 使用 useShallow 确保返回的对象引用稳定
 */
export const useChatActions = () => {
  const setMessages = useChatStore(state => state.setMessages)
  const addMessage = useChatStore(state => state.addMessage)
  const updateMessage = useChatStore(state => state.updateMessage)
  const updateMessageMetadata = useChatStore(state => state.updateMessageMetadata)
  const setInputMessage = useChatStore(state => state.setInputMessage)
  const setCurrentThreadId = useChatStore(state => state.setCurrentThreadId)
  const setGenerating = useChatStore(state => state.setGenerating)

  return useMemo(
    () => ({
      setMessages,
      addMessage,
      updateMessage,
      updateMessageMetadata,
      setInputMessage,
      setCurrentThreadId,
      setGenerating,
    }),
    [
      setMessages,
      addMessage,
      updateMessage,
      updateMessageMetadata,
      setInputMessage,
      setCurrentThreadId,
      setGenerating,
    ]
  )
}

/**
 * 获取单个 Action (性能最优，只订阅单个函数)
 */
export const useAddMessageAction = () => 
  useChatStore(state => state.addMessage)

export const useSetInputMessageAction = () =>
  useChatStore(state => state.setInputMessage)
