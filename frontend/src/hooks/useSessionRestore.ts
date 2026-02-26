/**
 * 会话恢复 Hook（合并版）
 * 支持页面加载自动恢复和 visibilitychange 唤醒恢复
 * 
 * @features
 * - 页面加载时自动恢复（初始恢复）
 * - visibilitychange 事件监听（标签页切换恢复）
 * - 5 秒防抖机制（防止重复恢复）
 * - 检测活跃的 SSE 连接，避免重复恢复
 * 
 * @description
 * v3.3.0: 合并 useSessionRestore 和 useSessionRecovery，统一恢复逻辑
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { useTaskStore } from '@/store/taskStore'
import { useChatStore } from '@/store/chatStore'
import { getEventHandler } from '@/handlers/eventHandlers'
import { logger } from '@/utils/logger'
import { getConversation } from '@/services/chat'

interface UseSessionRestoreOptions {
  /** 是否启用恢复 */
  enabled?: boolean
  /** 恢复完成后回调 */
  onRestored?: () => void
}

interface UseSessionRestoreReturn {
  /** 是否正在恢复 */
  isRestoring: boolean
  /** 是否已恢复 */
  isRestored: boolean
  /** 恢复错误 */
  error: Error | null
  /** 手动触发恢复 */
  restore: () => Promise<void>
}

/**
 * 会话恢复 Hook
 * 
 * 恢复流程：
 * 1. 从 localStorage 读取缓存状态（瞬间响应）
 * 2. 从服务端获取最新状态（校准）
 * 3. 合并状态，更新 UI
 * 
 * @description
 * 同时支持两种恢复场景：
 * - 页面刷新后恢复（useEffect 初始触发）
 * - 标签页切换后恢复（visibilitychange 事件）
 */
export function useSessionRestore(
  options: UseSessionRestoreOptions = {}
): UseSessionRestoreReturn {
  const { enabled = true, onRestored } = options
  const { id: conversationId } = useParams<{ id: string }>()
  
  const [isRestoring, setIsRestoring] = useState(false)
  const [isRestored, setIsRestored] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  
  // 防抖相关 refs
  const lastRestoreTimeRef = useRef(0)
  const hasActiveStreamRef = useRef(false)
  
  // 从 Store 获取状态（使用 Selectors 模式）
  const isInitialized = useTaskStore((state) => state.isInitialized)
  const session = useTaskStore((state) => state.session)
  const resetAll = useTaskStore((state) => state.resetAll)
  const restoreFromSession = useTaskStore((state) => state.restoreFromSession)
  const setIsWaitingForApproval = useTaskStore((state) => state.setIsWaitingForApproval)
  const addMessage = useChatStore((state) => state.addMessage)
  const setMessages = useChatStore((state) => state.setMessages)
  const setCurrentConversationId = useChatStore((state) => state.setCurrentConversationId)

  /**
   * 核心恢复逻辑
   * 支持两种触发方式：初始加载 和 visibilitychange
   */
  const performRestore = useCallback(async (): Promise<boolean> => {
    if (!conversationId || !enabled) {
      return false
    }

    // 防抖检查：5 秒内不重复恢复
    const now = Date.now()
    if (now - lastRestoreTimeRef.current < 5000) {
      return false
    }
    
    // 检查是否有活跃的 SSE 连接
    const chatStore = useChatStore.getState()
    if (chatStore.isGenerating) {
      hasActiveStreamRef.current = true
      return false
    }
    
    // 如果页面隐藏前有活跃流，但现在 isGenerating 为 false
    // 说明可能是浏览器后台节流导致的连接中断
    if (hasActiveStreamRef.current) {
      hasActiveStreamRef.current = false
    }

    lastRestoreTimeRef.current = now
    setIsRestoring(true)
    setError(null)

    try {
      // 检查本地 localStorage 是否已有数据
      const persistedState = localStorage.getItem('xpouch-task-store@2')
      const hasLocalData = persistedState && JSON.parse(persistedState).session

      // 从服务端获取会话详情
      const conversation = await getConversation(conversationId)
      
      // 检查是否是复杂模式（有 task_session）
      if (!conversation.task_session && !conversation.task_session_id) {
        setIsRestored(true)
        setIsRestoring(false)
        return true
      }

      // 简化：只恢复消息，tasks 由 persist 恢复
      if (conversation.messages && conversation.messages.length > 0) {
        setMessages(conversation.messages)
      }
      setCurrentConversationId(conversationId)
      
      // 恢复任务状态（智能合并）
      const { task_session } = conversation
      if (task_session?.sub_tasks) {
        const subTasks = task_session.sub_tasks || []
        
        // 统计 API 返回的 artifacts 数量
        const apiArtifactCount = subTasks.reduce((sum: number, t: any) => 
          sum + (t.artifacts?.length || 0), 0)
        
        // 检查本地数据
        const taskStore = useTaskStore.getState()
        let localArtifactCount = 0
        taskStore.tasks.forEach((task: any) => {
          localArtifactCount += task?.artifacts?.length || 0
        })
        
        // 智能决策：
        // 1. 本地无数据 -> 从 API 恢复
        // 2. API 有 artifacts 但本地没有 -> 从 API 恢复（数据更完整）
        // 3. 其他情况 -> 保留本地数据
        if (taskStore.tasks.size === 0) {
          restoreFromSession(task_session, subTasks)
        } else if (apiArtifactCount > 0 && localArtifactCount === 0) {
          restoreFromSession(task_session, subTasks)
        }
        
        // 检查是否还有运行中的任务
        const hasRunningTask = subTasks.some((t: any) => t.status === 'running')
        const hasPendingTask = subTasks.some((t: any) => t.status === 'pending')
        
        // 如果有运行中的任务，提示用户任务仍在进行
        if (hasRunningTask) {
          
          // 添加系统消息提示用户
          addMessage({
            role: 'system',
            content: '检测到页面曾切换到后台，任务仍在执行中。请等待完成或刷新页面查看最新结果。',
            timestamp: Date.now()
          })
        }
        
        // 检查会话状态是否需要用户干预（如 HITL 等待确认）
        if (task_session.status === 'waiting_for_approval' && hasPendingTask) {
          setIsWaitingForApproval(true)
        }
      }

      setIsRestored(true)
      onRestored?.()
      
      return true
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      logger.error('[useSessionRestore] 恢复失败:', error)
      setError(error)
      
      // 恢复失败时清空本地状态，避免显示过期数据
      resetAll()
      return false
    } finally {
      setIsRestoring(false)
    }
  }, [conversationId, enabled, isInitialized, restoreFromSession, setIsWaitingForApproval, addMessage, resetAll, onRestored, setMessages, setCurrentConversationId])

  /**
   * 公开的手动恢复方法
   */
  const restore = useCallback(async () => {
    await performRestore()
  }, [performRestore])

  /**
   * 初始恢复：页面加载时自动触发
   */
  useEffect(() => {
    if (enabled && conversationId && !isRestored && !isRestoring) {
      performRestore()
    }
  }, [enabled, conversationId, isRestored, isRestoring, performRestore])

  /**
   * visibilitychange 恢复：标签页切换时触发
   */
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // 页面隐藏时，标记是否有活跃流
        const chatStore = useChatStore.getState()
        hasActiveStreamRef.current = chatStore.isGenerating
        return
      }
      
      // 页面重新可见时触发恢复
      if (enabled && conversationId) {
        performRestore()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [enabled, conversationId, performRestore])

  /**
   * 清理：会话切换时重置状态
   */
  useEffect(() => {
    return () => {
      setIsRestored(false)
      setError(null)
      lastRestoreTimeRef.current = 0
    }
  }, [conversationId])

  return {
    isRestoring,
    isRestored,
    error,
    restore
  }
}

/**
 * 检查是否有可恢复的会话
 */
export function hasRestorableSession(conversationId: string): boolean {
  try {
    const key = `xpouch-task-store@2`
    const stored = localStorage.getItem(key)
    if (!stored) return false
    
    const parsed = JSON.parse(stored)
    // 检查存储的会话是否匹配当前对话（使用 tasks 检查替代 isInitialized）
    const hasTasks = parsed.tasks && 
      (Array.isArray(parsed.tasks) ? parsed.tasks.length > 0 : parsed.tasks.size > 0)
    return parsed.session?.sessionId && hasTasks
  } catch {
    return false
  }
}

/**
 * 清除会话恢复数据
 */
export function clearSessionRestoreData(): void {
  try {
    const key = `xpouch-task-store@2`
    localStorage.removeItem(key)
    
    // 同时清除事件处理器的已处理事件记录
    getEventHandler().clearProcessedEvents()
  } catch (e) {
    logger.error('[useSessionRestore] 清除恢复数据失败:', e)
  }
}
