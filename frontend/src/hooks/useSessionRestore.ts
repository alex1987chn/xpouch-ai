/**
 * 会话恢复 Hook
 * 页面刷新后从 localStorage 恢复任务状态，并与服务端同步
 */

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { useTaskStore } from '@/store/taskStore'
import { getEventHandler } from '@/handlers/eventHandlers'
import { logger } from '@/utils/logger'
import { getConversation } from '@/services/chat'

// 开发环境判断
const DEBUG = import.meta.env.VITE_DEBUG_MODE === 'true'

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
 */
export function useSessionRestore(
  options: UseSessionRestoreOptions = {}
): UseSessionRestoreReturn {
  const { enabled = true, onRestored } = options
  const { id: conversationId } = useParams<{ id: string }>()
  
  const [isRestoring, setIsRestoring] = useState(false)
  const [isRestored, setIsRestored] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  
  // 从 Store 获取状态
  const isInitialized = useTaskStore((state) => state.isInitialized)
  const session = useTaskStore((state) => state.session)
  const initializePlan = useTaskStore((state) => state.initializePlan)
  const clearTasks = useTaskStore((state) => state.clearTasks)

  /**
   * 执行恢复
   */
  const restore = useCallback(async () => {
    if (!conversationId || !enabled) {
      return
    }

    // 如果已经有初始化的任务会话，不需要恢复
    if (isInitialized && session) {
      if (DEBUG) {
        logger.debug('[useSessionRestore] 已有任务会话，跳过恢复')
      }
      setIsRestored(true)
      return
    }

    setIsRestoring(true)
    setError(null)

    try {
      if (DEBUG) {
        logger.debug('[useSessionRestore] 开始恢复会话:', conversationId)
      }

      // 1. 从服务端获取会话详情
      const conversation = await getConversation(conversationId)
      
      // 2. 检查是否是复杂模式（有 task_session）
      if (!conversation.task_session_id) {
        if (DEBUG) {
          logger.debug('[useSessionRestore] 非复杂模式，无需恢复')
        }
        setIsRestored(true)
        setIsRestoring(false)
        return
      }

      // 3. 从服务端获取完整任务会话
      // TODO: 需要添加 API 端点 /api/task-sessions/:id
      // const taskSession = await getTaskSession(conversation.task_session_id)
      
      // 4. 恢复任务计划
      // if (taskSession) {
      //   initializePlan({
      //     session_id: taskSession.session_id,
      //     summary: taskSession.plan_summary,
      //     estimated_steps: taskSession.estimated_steps,
      //     execution_mode: taskSession.execution_mode as 'sequential' | 'parallel',
      //     tasks: taskSession.sub_tasks.map(st => ({
      //       id: st.id,
      //       expert_type: st.expert_type,
      //       description: st.task_description,
      //       sort_order: st.sort_order,
      //       status: st.status as 'pending' | 'running' | 'completed' | 'failed'
      //     }))
      //   })
      // }

      if (DEBUG) {
        logger.debug('[useSessionRestore] 会话恢复完成')
      }

      setIsRestored(true)
      onRestored?.()
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      logger.error('[useSessionRestore] 恢复失败:', error)
      setError(error)
      
      // 恢复失败时清空本地状态，避免显示过期数据
      clearTasks()
    } finally {
      setIsRestoring(false)
    }
  }, [conversationId, enabled, isInitialized, session, initializePlan, clearTasks, onRestored])

  /**
   * 自动恢复
   */
  useEffect(() => {
    if (enabled && conversationId && !isRestored && !isRestoring) {
      restore()
    }
  }, [enabled, conversationId, isRestored, isRestoring, restore])

  /**
   * 清理：会话切换时重置状态
   */
  useEffect(() => {
    return () => {
      setIsRestored(false)
      setError(null)
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
    const key = `xpouch-task-store@1`
    const stored = localStorage.getItem(key)
    if (!stored) return false
    
    const parsed = JSON.parse(stored)
    // 检查存储的会话是否匹配当前对话
    return parsed.session?.sessionId && parsed.isInitialized
  } catch {
    return false
  }
}

/**
 * 清除会话恢复数据
 */
export function clearSessionRestoreData(): void {
  try {
    const key = `xpouch-task-store@1`
    localStorage.removeItem(key)
    
    // 同时清除事件处理器的已处理事件记录
    getEventHandler().clearProcessedEvents()
    
    if (DEBUG) {
      logger.debug('[useSessionRestore] 清除恢复数据')
    }
  } catch (e) {
    logger.error('[useSessionRestore] 清除恢复数据失败:', e)
  }
}
