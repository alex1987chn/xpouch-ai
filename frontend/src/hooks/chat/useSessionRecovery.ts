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
 * - 处理浏览器后台标签页导致的 SSE 中断
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
    // 页面可见性变化时更新活跃流标记
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'hidden') {
        // 页面隐藏时，标记是否有活跃流
        const chatStore = useChatStore.getState()
        hasActiveStreamRef.current = chatStore.isGenerating
        return
      }
      
      // 页面重新可见时的恢复逻辑
      // 防抖：5 秒内不重复恢复
      const now = Date.now()
      if (now - lastRecoveryTimeRef.current < 5000) {
        return
      }
      
      // 检查是否需要恢复
      const taskStore = useTaskStore.getState()
      const chatStore = useChatStore.getState()
      
      // 如果当前正在生成中，说明连接仍然活跃，不需要恢复
      if (chatStore.isGenerating) {
        logger.debug('[SessionRecovery] 正在生成中，连接活跃，跳过恢复')
        hasActiveStreamRef.current = true
        return
      }
      
      // 如果页面隐藏前有活跃流，但现在 isGenerating 为 false
      // 说明可能是浏览器后台节流导致的连接中断，需要恢复状态
      if (hasActiveStreamRef.current) {
        logger.warn('[SessionRecovery] 检测到可能的 SSE 中断（浏览器后台节流），开始状态恢复')
        hasActiveStreamRef.current = false
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
          const hasPendingTask = subTasks.some(t => t.status === 'pending')
          
          logger.debug('[SessionRecovery] 状态恢复完成:', {
            taskCount: subTasks.length,
            hasRunningTask,
            hasPendingTask,
            sessionStatus: task_session.status
          })
          
          // 5. 如果有运行中的任务，提示用户任务仍在进行
          // 注意：由于 SSE 连接已断开，我们无法自动恢复流式输出
          // 用户需要等待任务完成或刷新页面查看最新结果
          if (hasRunningTask) {
            logger.info('[SessionRecovery] 检测到运行中的任务，任务仍在后台执行')
            
            // 添加系统消息提示用户
            const { addMessage } = chatStore
            addMessage({
              role: 'system',
              content: '检测到页面曾切换到后台，任务仍在执行中。请等待完成或刷新页面查看最新结果。',
              timestamp: Date.now()
            })
          }
          
          // 6. 检查会话状态是否需要用户干预（如 HITL 等待确认）
          if (task_session.status === 'waiting_for_approval' && hasPendingTask) {
            logger.info('[SessionRecovery] 检测到 HITL 等待确认状态')
            // 确保任务状态正确显示
            taskStore.setIsWaitingForApproval(true)
          }
        }
      } catch (error) {
        logger.error('[SessionRecovery] 状态恢复失败:', error)
      } finally {
        isRecoveryInProgressRef.current = false
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [conversationId])
  
  return isRecoveryInProgressRef.current
}
