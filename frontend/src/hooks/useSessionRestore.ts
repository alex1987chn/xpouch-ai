/**
 * 会话恢复 Hook
 * 支持页面加载自动恢复和 visibilitychange 唤醒恢复
 * 
 * @features
 * - 页面加载时自动恢复（初始恢复）
 * - visibilitychange 事件监听（标签页切换恢复）
 * - 5 秒防抖机制（防止重复恢复）
 * - 检测活跃的 SSE 连接，避免重复恢复
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { useTaskStore } from '@/store/taskStore'
import { useChatStore } from '@/store/chatStore'
import { getEventHandler } from '@/handlers'
import { logger } from '@/utils/logger'
import { getConversation } from '@/services/chat'
import type { SubTask } from '@/types'

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

function isStatusError(error: unknown): error is { status?: number } {
  return typeof error === 'object' && error !== null && 'status' in error
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
  const { id: threadId } = useParams<{ id: string }>()
  
  const [isRestoring, setIsRestoring] = useState(false)
  const [isRestored, setIsRestored] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  
  // 防抖相关 refs
  const lastRestoreTimeRef = useRef(0)
  const hasActiveStreamRef = useRef(false)
  
  // 从 Store 获取状态（使用 Selectors 模式）
  const resetAll = useTaskStore((state) => state.resetAll)
  const restoreFromSession = useTaskStore((state) => state.restoreFromSession)
  const setPendingPlan = useTaskStore((state) => state.setPendingPlan)
  const setMode = useTaskStore((state) => state.setMode)
  const setIsInitialized = useTaskStore((state) => state.setIsInitialized)
  const addMessage = useChatStore((state) => state.addMessage)
  const setMessages = useChatStore((state) => state.setMessages)
  const setCurrentConversationId = useChatStore((state) => state.setCurrentConversationId)

  /**
   * 核心恢复逻辑
   * 支持两种触发方式：初始加载 和 visibilitychange
   */
  const performRestore = useCallback(async (): Promise<boolean> => {
    if (!threadId || !enabled) {
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
      // 从服务端获取会话详情
      const conversation = await getConversation(threadId)
      
      // 🔥 恢复消息（无论简单模式还是复杂模式）
      if (conversation.messages && conversation.messages.length > 0) {
        // 🔥🔥🔥 前端暴力排序：确保消息按 timestamp 升序排列
        const sortedMessages = [...conversation.messages].sort((a, b) => {
          const timeA = new Date(a.timestamp || 0).getTime()
          const timeB = new Date(b.timestamp || 0).getTime()
          return timeA - timeB
        })
        setMessages(sortedMessages)
      }
      setCurrentConversationId(threadId)
      
      // 检查是否是复杂模式（有 execution_plan）
      if (!conversation.execution_plan && !conversation.execution_plan_id) {
        // 简单模式：只恢复消息即可
        setIsRestored(true)
        setIsRestoring(false)
        return true
      }
      
      // 复杂模式：恢复任务状态（智能合并）
      const { execution_plan } = conversation
      if (execution_plan?.sub_tasks) {
        const subTasks = execution_plan.sub_tasks || []
        
        // 统计 API 返回的 artifacts 数量
        const apiArtifactCount = subTasks.reduce((sum: number, t: SubTask) =>
          sum + (t.artifacts?.length || 0), 0)
        
        // 检查本地数据
        const taskStore = useTaskStore.getState()
        let localArtifactCount = 0
        taskStore.tasks.forEach((task) => {
          localArtifactCount += task?.artifacts?.length || 0
        })
        
        // 智能决策：
        // 1. 本地无数据 -> 从 API 恢复
        // 2. API 有 artifacts 但本地没有 -> 从 API 恢复（数据更完整）
        // 3. 其他情况 -> 保留本地数据
        if (taskStore.tasks.size === 0) {
          restoreFromSession(execution_plan, subTasks)
          // 🔥 恢复成功后设置 UI 状态
          setMode('complex')
          setIsInitialized(true)
        } else if (apiArtifactCount > 0 && localArtifactCount === 0) {
          restoreFromSession(execution_plan, subTasks)
          // 🔥 恢复成功后设置 UI 状态
          setMode('complex')
          setIsInitialized(true)
        }
        
        // 检查是否还有运行中的任务
        const hasRunningTask = subTasks.some((t: SubTask) => t.status === 'running')
        const hasPendingTask = subTasks.some((t: SubTask) => t.status === 'pending')
        
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
        // 🔥 方案1：从 subTasks 恢复 pendingPlan
        if (execution_plan.status === 'waiting_for_approval' && hasPendingTask) {
          // 从 subTasks 构建 pendingPlan
          const pendingPlan = subTasks
            .filter((t: SubTask) => t.status === 'pending')
            .map((t: SubTask, index: number) => ({
              id: t.id,
              expert_type: t.expert_type,
              description: t.task_description,
              sort_order: index,
              status: 'pending' as const,
              depends_on: t.depends_on || [],
            }))

          if (pendingPlan.length > 0) {
            setPendingPlan(
              pendingPlan,
              execution_plan.plan_version || 1,
              execution_plan.run_id || null,
              execution_plan.execution_plan_id || null,
            )
            logger.debug('[useSessionRestore] HITL 恢复: pendingPlan 已设置', pendingPlan.length, '个任务')
          }
        }
      }

      setIsRestored(true)
      onRestored?.()
      
      return true
    } catch (err: unknown) {
      // 🔥 404 错误静默处理：新会话在后端还不存在，这是预期行为
      if (isStatusError(err) && err.status === 404) {
        logger.debug('[useSessionRestore] 会话不存在（新会话），跳过恢复')
        setIsRestored(true) // 标记为已恢复，避免重复尝试
        return true
      }

      const error = err instanceof Error ? err : new Error(String(err))
      logger.error('[useSessionRestore] 恢复失败:', error)
      setError(error)

      // 恢复失败时清空本地状态，避免显示过期数据
      resetAll()
      return false
    } finally {
      setIsRestoring(false)
    }
  }, [threadId, enabled, restoreFromSession, setPendingPlan, setMode, setIsInitialized, addMessage, resetAll, onRestored, setMessages, setCurrentConversationId])

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
    if (enabled && threadId && !isRestored && !isRestoring) {
      performRestore()
    }
  }, [enabled, threadId, isRestored, isRestoring, performRestore])

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
      if (enabled && threadId) {
        performRestore()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [enabled, threadId, performRestore])

  /**
   * 清理：会话切换时重置状态
   */
  useEffect(() => {
    return () => {
      setIsRestored(false)
      setError(null)
      lastRestoreTimeRef.current = 0
    }
  }, [threadId])

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
export function hasRestorableSession(_threadId: string): boolean {
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
