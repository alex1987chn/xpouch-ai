/**
 * =============================
 * Zustand Selectors (性能优化)
 * =============================
 *
 * [目的]
 * 集中管理所有 Store 的 selector，避免内联 selector 导致的重渲染问题
 *
 * [使用方法]
 * import { authSelectors, chatSelectors } from '@/store/selectors'
 *
 * // 在组件中
 * const { isAuthenticated, user } = authSelectors.useAuth()
 * const messages = chatSelectors.useMessages()
 *
 * [原理]
 * 1. useShallow: 浅比较返回对象，只有当对象内容变化时才触发重渲染
 * 2. 稳定引用: selector 函数定义在组件外，不会每次渲染都创建新函数
 */

import { useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useUserStore } from './userStore'
import { useChatStore } from './chatStore'
import { useTaskStore } from './taskStore'

// ============================================================================
// Auth Selectors
// ============================================================================

export const authSelectors = {
  /**
   * 认证相关状态（整体获取）
   */
  useAuth: () => useUserStore(
    useShallow(state => ({
      isAuthenticated: state.isAuthenticated,
      user: state.user,
      isLoading: state.isLoading,
    }))
  ),

  /**
   * 仅获取认证状态（用于条件渲染）
   */
  useIsAuthenticated: () => useUserStore(state => state.isAuthenticated),

  /**
   * 仅获取用户信息
   */
  useUser: () => useUserStore(useShallow(state => state.user)),

  /**
   * 登录弹窗控制
   */
  useLoginDialog: () => useTaskStore(
    useShallow(state => ({
      isLoginDialogOpen: state.isLoginDialogOpen,
      setLoginDialogOpen: state.setLoginDialogOpen,
    }))
  ),
}

// ============================================================================
// Chat Selectors
// ============================================================================

export const chatSelectors = {
  /**
   * 消息列表
   */
  useMessages: () => useChatStore(state => state.messages),

  /**
   * 当前会话状态
   */
  useConversation: () => useChatStore(
    useShallow(state => ({
      currentConversationId: state.currentConversationId,
      messages: state.messages,
      isGenerating: state.isGenerating,
    }))
  ),

  /**
   * 输入框状态
   */
  useInput: () => useChatStore(
    useShallow(state => ({
      inputMessage: state.inputMessage,
      setInputMessage: state.setInputMessage,
    }))
  ),

  /**
   * 智能体选择
   */
  useSelectedAgent: () => useChatStore(
    useShallow(state => ({
      selectedAgentId: state.selectedAgentId,
      customAgents: state.customAgents,
    }))
  ),

  /**
   * 待发送消息（登录后自动发送用）
   */
  usePendingMessage: () => useChatStore(
    useShallow(state => ({
      pendingMessage: state.pendingMessage,
      shouldRetrySend: state.shouldRetrySend,
      setPendingMessage: state.setPendingMessage,
      setShouldRetrySend: state.setShouldRetrySend,
    }))
  ),
}

// ============================================================================
// Task Selectors
// ============================================================================

export const taskSelectors = {
  /**
   * 任务执行状态
   */
  useTaskStatus: () => useTaskStore(
    useShallow(state => ({
      mode: state.mode,
      runningTaskIds: state.runningTaskIds,
      isWaitingForApproval: state.isWaitingForApproval,
      hasRunningTasks: state.hasRunningTasks,
    }))
  ),

  /**
   * 进度信息
   */
  useProgress: () => useTaskStore(state => state.progress),
}
