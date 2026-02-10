/**
 * 会话恢复 Hook
 *
 * @description
 * 负责页面重新可见时恢复任务状态（解决页面切换/Tab切换导致的状态丢失问题）
 * 
 * @features
 * - 监听 visibilitychange 事件
 * - 防抖机制（5秒内不重复恢复）
 * - 检测活跃的 SSE 连接，避免重复恢复
 * - 调用 getConversation 和 taskStore.restoreFromSession
 *
 * @example
 * ```typescript
 * const isRecovering = useSessionRecovery(conversationId)
 * ```
 */

import { useEffect, useRef } from 'react'
import { getConversation } from '@/services/chat'
import { useTaskStore } from '@/store/taskStore'
import { useChatStore } from '@/store/chatStore'
import { logger } from '@/utils/logger'

/**
 * 会话恢复 Hook
 * @param conversationId - 当前会话 ID
 * @returns isRecovering - 是否正在恢复中
 */
export function useSessionRecovery(conversationId: string): boolean {
  const isRecoveryInProgressRef = useRef(false)
  const lastRecoveryTimeRef = useRef(0)
  // 标记是否有活跃的 SSE 连接（防止页面切换时重复触发）
  const hasActiveStreamRef = useRef(false)
  
  useEffect(() => {
    // 只在复杂模式下且当前有任务会话时才需要恢复
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        // 如果有活跃的 SSE 连接，不要做任何恢复操作
        if (hasActiveStreamRef.current) {
          logger.debug('[SessionRecovery] 有活跃的 SSE 连接，跳过恢复')
          return
        }
        
        // 防抖：5 秒内不重复恢复
        const now = Date.now()
        if (now - lastRecoveryTimeRef.current < 5000) {
          return
        }
        
        // 检查是否需要恢复
        const taskStore = useTaskStore.getState()
        const chatStore = useChatStore.getState()
        
        // 如果有正在进行的 SSE 连接，不需要恢复
        if (chatStore.isGenerating) {
          logger.debug('[SessionRecovery] 正在生成中，跳过恢复')
          hasActiveStreamRef.current = true
          return
        }
        
        // 如果没有会话 ID，不需要恢复
        if (!conversationId) {
          return
        }
        
        // 如果已经有初始化的任务且没有运行中的任务，不需要恢复
        if (taskStore.isInitialized && taskStore.runningTaskIds.size === 0) {
          return
        }
        
        // 开始恢复
        isRecoveryInProgressRef.current = true
        lastRecoveryTimeRef.current = now
        
        try {
          logger.debug('[SessionRecovery] 页面重新可见，开始状态恢复')
          
          // 1. 拉取最新会话状态
          const conversation = await getConversation(conversationId)
          
          // 2. 检查是否有任务会话
          if (conversation.task_session && conversation.task_session.sub_tasks) {
            const { task_session } = conversation
            const subTasks = task_session.sub_tasks || []
            
            // 3. 恢复任务状态到 Store
            taskStore.restoreFromSession(task_session, subTasks)
            
            // 4. 检查是否还有运行中的任务
            const hasRunningTask = subTasks.some(t => t.status === 'running')
            
            logger.debug('[SessionRecovery] 状态恢复完成:', {
              taskCount: subTasks.length,
              hasRunningTask,
              sessionStatus: task_session.status
            })
            
            // 5. 如果有运行中的任务，提示用户任务仍在进行
            // 注意：由于 SSE 连接已断开，我们无法自动恢复流式输出
            // 用户需要等待任务完成或刷新页面查看最新结果
            if (hasRunningTask) {
              logger.debug('[SessionRecovery] 检测到运行中的任务，建议用户等待或刷新')
            }
          }
        } catch (error) {
          logger.error('[SessionRecovery] 状态恢复失败:', error)
        } finally {
          isRecoveryInProgressRef.current = false
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [conversationId])
  
  return isRecoveryInProgressRef.current
}
