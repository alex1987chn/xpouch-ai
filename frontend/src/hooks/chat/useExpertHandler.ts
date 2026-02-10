/**
 * 专家事件处理 Hook
 * v3.0: 只处理新协议事件，更新 taskStore
 */

import { useCallback, useRef, useMemo, useEffect } from 'react'
import { useChatStore } from '@/store/chatStore'
import { useTaskStore } from '@/store/taskStore'
import { getExpertConfig } from '@/constants/systemAgents'
import type { AnyServerEvent } from '@/types/events'
import type { ThinkingStep } from '@/types'
import { logger } from '@/utils/logger'
import { generateUUID } from '@/utils'

// ============================================================================
// Helper: 根据 expert_type 推断 thinking step 类型
// v3.1: 新增 memory 类型支持
// ============================================================================
const getExpertType = (expertType: string): ThinkingStep['type'] => {
  const type = expertType.toLowerCase()
  if (type.includes('search')) return 'search'
  if (type.includes('read') || type.includes('research')) return 'reading'
  if (type.includes('code')) return 'coding'
  if (type.includes('plan')) return 'planning'
  if (type.includes('write')) return 'writing'
  if (type.includes('analysis') || type.includes('analyz')) return 'analysis'
  if (type.includes('memory') || type.includes('recall')) return 'memory'
  return 'default'
}

// 开发环境判断
const DEBUG = import.meta.env.VITE_DEBUG_MODE === 'true'

const debug = DEBUG
  ? (...args: unknown[]) => logger.debug('[useExpertHandler]', ...args)
  : () => {}

/**
 * 专家事件处理 Hook
 * v3.0: 只处理新协议事件
 */
export function useExpertHandler() {
  // 🔥 修复：使用 ref 获取 Store，确保总是获取最新状态
  const chatStoreRef = useRef(useChatStore.getState())
  const taskStoreRef = useRef(useTaskStore.getState())
  
  // 监听 Store 更新
  useEffect(() => {
    const unsubscribeChat = useChatStore.subscribe((state) => {
      chatStoreRef.current = state
    })
    const unsubscribeTask = useTaskStore.subscribe((state) => {
      taskStoreRef.current = state
    })
    return () => {
      unsubscribeChat()
      unsubscribeTask()
    }
  }, [])
  
  // 使用 ref 获取所有 store actions - 这些 actions 是稳定的
  const taskActionsRef = useRef({
    initializePlan: useTaskStore.getState().initializePlan,
    startTask: useTaskStore.getState().startTask,
    completeTask: useTaskStore.getState().completeTask,
    failTask: useTaskStore.getState().failTask,
    addArtifact: useTaskStore.getState().addArtifact,
    selectTask: useTaskStore.getState().selectTask,
  })
  
  // 保持 actions 引用稳定
  const taskActions = taskActionsRef.current
  
  // 🔥 获取 updateMessageMetadata 的辅助函数（用于批量更新）
  const updateMessageMetadata = (messageId: string, metadata: any) => {
    chatStoreRef.current.updateMessageMetadata(messageId, metadata)
  }
  
  // 🔥 新增：简化版更新 thinking step 的辅助函数（自动更新最后一条消息）
  const updateLastMessageThought = (step: ThinkingStep) => {
    chatStoreRef.current.updateLastMessageThoughts(step)
  }

  // 获取最后一条 AI 消息的 ID（使用 ref 获取最新状态）
  const getLastAssistantMessageId = () => {
    const messages = chatStoreRef.current.messages
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') {
        return messages[i].id
      }
    }
    return null
  }

  /**
   * v3.0: 处理新协议事件
   */
  const handleExpertEvent = useCallback(async (
    event: AnyServerEvent,
    conversationMode: 'simple' | 'complex'
  ) => {
    // 🔥 调试：打印所有事件
    console.log(`[useExpertHandler] 收到事件: ${event.type}`, event.data)

    switch (event.type) {
      case 'router.decision': {
        // mode 已经在 eventHandlers.ts 中设置
        // 这里可以触发其他副作用（如展开右侧面板）
        debug('路由决策:', event.data.decision)
        break
      }
      
      case 'plan.created': {
        const planData = event.data
        
        debug('[plan.created] 收到计划创建事件:', planData)
        
        // 1. 更新 taskStore（初始化任务计划）
        taskActions.initializePlan(planData)
        
        // 2. 🔥🔥🔥 完全重建 thinking 步骤
        const taskIds = planData.tasks.map((t: any) => t.id)
        console.log('[plan.created] 完全重建 thinking 步骤:', { taskCount: taskIds.length, taskIds })
        
        const messageId = getLastAssistantMessageId()
        if (messageId) {
          // 🔥 直接基于新的任务列表构建完整的 thinking 数组
          const newThinking: ThinkingStep[] = []
          
          // 添加 planning step
          const taskPlanJson = {
            tasks: planData.tasks.map((t: any) => ({
              expert_type: t.expert_type,
              description: t.description,
              priority: t.sort_order || 0
            })),
            strategy: planData.summary || '复杂任务规划',
            estimated_steps: planData.estimated_steps
          }
          
          newThinking.push({
            id: `plan-${planData.session_id}`,
            expertType: 'planner',
            expertName: 'Task Planning',
            content: JSON.stringify(taskPlanJson, null, 2),
            timestamp: new Date().toISOString(),
            status: 'completed',
            type: 'planning'
          })
          
          // 🔥 基于新任务列表添加所有任务 step（按顺序）
          planData.tasks.forEach((task: any) => {
            newThinking.push({
              id: task.id,
              expertType: task.expert_type,
              expertName: getExpertConfig(task.expert_type).name,
              content: task.description,
              timestamp: new Date().toISOString(),
              status: task.status === 'completed' ? 'completed' : 'pending',
              type: getExpertType(task.expert_type)
            })
          })
          
          debug('[plan.created] 设置新 thinking:', newThinking.length)
          updateMessageMetadata(messageId, { thinking: newThinking })
        }
        break
      }
      
      case 'task.started': {
        const taskData = event.data
        
        // 1. 更新 taskStore
        taskActions.startTask(taskData)
        
        // 2. 更新当前消息的 thinking（将 pending 改为 running）
        // 🔥 简化：使用 updateLastMessageThought 自动处理最后一条消息
        updateLastMessageThought({
          id: taskData.task_id,
          expertType: taskData.expert_type,
          expertName: getExpertConfig(taskData.expert_type).name,
          content: taskData.description,
          timestamp: taskData.started_at,
          status: 'running',
          type: getExpertType(taskData.expert_type)
        })
        break
      }
      
      case 'task.completed': {
        const taskData = event.data
        
        // 1. 更新 taskStore
        taskActions.completeTask(taskData)
        
        // 2. 更新当前消息的 thinking（更新为 completed 状态）
        // 🔥 简化：使用 updateLastMessageThought 自动处理最后一条消息
        updateLastMessageThought({
          id: taskData.task_id,
          expertType: taskData.expert_type,
          expertName: getExpertConfig(taskData.expert_type).name,
          content: taskData.output || taskData.description,
          timestamp: taskData.completed_at,
          status: 'completed',
          type: getExpertType(taskData.expert_type),
          duration: taskData.duration_ms
        })
        break
      }
      
      case 'task.failed': {
        const taskData = event.data
        
        // 1. 更新 taskStore
        taskActions.failTask(taskData)
        
        // 2. 更新当前消息的 thinking（更新为 failed 状态）
        // 🔥 简化：使用 updateLastMessageThought 自动处理最后一条消息
        updateLastMessageThought({
          id: taskData.task_id,
          expertType: taskData.expert_type,
          expertName: getExpertConfig(taskData.expert_type).name,
          content: `${taskData.description}\n\n错误: ${taskData.error}`,
          timestamp: taskData.failed_at,
          status: 'failed',
          type: getExpertType(taskData.expert_type)
        })
        break
      }
      
      case 'artifact.generated': {
        const artifactData = event.data
        
        taskActions.addArtifact(artifactData)
        
        // 自动选中该任务
        taskActions.selectTask(artifactData.task_id)
        break
      }
      
      case 'error': {
        logger.error('[useExpertHandler] 服务器错误:', event.data.code, event.data.message)
        break
      }
      
      default:
        debug('未处理的事件类型:', (event as any).type)
    }
  }, [taskActions])

  // 使用 useMemo 保持返回对象稳定
  return useMemo(() => ({
    handleExpertEvent,
  }), [handleExpertEvent])
}
