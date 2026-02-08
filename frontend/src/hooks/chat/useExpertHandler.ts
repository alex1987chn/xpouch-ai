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
// ============================================================================
const getExpertType = (expertType: string): ThinkingStep['type'] => {
  const type = expertType.toLowerCase()
  if (type.includes('search')) return 'search'
  if (type.includes('read') || type.includes('research')) return 'reading'
  if (type.includes('code')) return 'coding'
  if (type.includes('plan')) return 'planning'
  if (type.includes('write')) return 'writing'
  if (type.includes('analysis') || type.includes('analyz')) return 'analysis'
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
  
  // 🔥 获取 updateMessageMetadata 的辅助函数
  const updateMessageMetadata = (messageId: string, metadata: any) => {
    chatStoreRef.current.updateMessageMetadata(messageId, metadata)
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
        
        // 2. 添加到当前消息的 thinking（一次性添加所有步骤）
        const messageId = getLastAssistantMessageId()
        debug('[plan.created] 找到的消息 ID:', messageId)
        
        if (messageId) {
          const message = chatStoreRef.current.messages.find(m => m.id === messageId)
          const existingThinking = message?.metadata?.thinking || []
          
          // 🔥 检查是否已存在 planning step（避免重复添加）
          const hasPlanningStep = existingThinking.some((s: ThinkingStep) => 
            s.expertType === 'planner' || s.type === 'planning'
          )
          
          if (hasPlanningStep) {
            debug('[plan.created] planning step 已存在，跳过')
            break
          }
          
          // 🔥 新策略：一次性添加所有步骤（planning + 所有任务）
          // 这样从一开始就显示完整的进度（如 1/6, 2/6, 3/6...）
          const newSteps: ThinkingStep[] = []
          
          // 1) 添加 planning step（已完成）
          const taskPlanJson = {
            tasks: planData.tasks.map((t: any) => ({
              expert_type: t.expert_type,
              description: t.description,
              priority: t.sort_order || 0
            })),
            strategy: planData.summary || '复杂任务规划',
            estimated_steps: planData.estimated_steps
          }
          
          newSteps.push({
            id: `plan-${planData.session_id}`,
            expertType: 'planner',
            expertName: 'Task Planning',
            content: JSON.stringify(taskPlanJson, null, 2),
            timestamp: new Date().toISOString(),
            status: 'completed',
            type: 'planning'
          })
          
          // 2) 为每个任务添加 pending 状态的 step
          planData.tasks.forEach((task: any) => {
            newSteps.push({
              id: task.id,
              expertType: task.expert_type,
              expertName: getExpertConfig(task.expert_type).name,
              content: task.description,
              timestamp: new Date().toISOString(),
              status: 'pending',  // 初始状态为 pending
              type: getExpertType(task.expert_type)
            })
          })
          
          debug('[plan.created] 准备添加所有 steps:', newSteps.length)
          updateMessageMetadata(messageId, { 
            thinking: [...existingThinking, ...newSteps].slice(-50)
          })
        } else {
          debug('[plan.created] 警告：没有找到最后一条助手消息')
        }
        break
      }
      
      case 'task.started': {
        const taskData = event.data
        
        // 1. 更新 taskStore
        taskActions.startTask(taskData)
        
        // 2. 更新当前消息的 thinking（将 pending 改为 running）
        const messageId = getLastAssistantMessageId()
        if (messageId) {
          const message = chatStoreRef.current.messages.find(m => m.id === messageId)
          const existingThinking = message?.metadata?.thinking || []
          
          // 🔥 查找并更新现有 step（现在在 plan.created 时已添加）
          const updatedThinking = existingThinking.map((step: ThinkingStep) => {
            if (step.id === taskData.task_id) {
              return {
                ...step,
                status: 'running' as const,
                timestamp: taskData.started_at
              }
            }
            return step
          })
          
          // 如果没有找到（容错），添加新 step
          if (!updatedThinking.find((s: ThinkingStep) => s.id === taskData.task_id)) {
            updatedThinking.push({
              id: taskData.task_id,
              expertType: taskData.expert_type,
              expertName: getExpertConfig(taskData.expert_type).name,
              content: taskData.description,
              timestamp: taskData.started_at,
              status: 'running',
              type: getExpertType(taskData.expert_type)
            })
          }
          
          updateMessageMetadata(messageId, { 
            thinking: updatedThinking.slice(-50)
          })
        }
        break
      }
      
      case 'task.completed': {
        const taskData = event.data
        
        // 1. 更新 taskStore
        taskActions.completeTask(taskData)
        
        // 2. 更新当前消息的 thinking（更新现有 step，而不是创建新 step）
        const messageId = getLastAssistantMessageId()
        if (messageId) {
          const message = chatStoreRef.current.messages.find(m => m.id === messageId)
          const existingThinking = message?.metadata?.thinking || []
          
          // 🔥 查找并更新现有 step
          const updatedThinking = existingThinking.map((step: ThinkingStep) => {
            if (step.id === taskData.task_id) {
              return {
                ...step,
                status: 'completed' as const,
                content: taskData.output || taskData.description,
                duration: taskData.duration_ms
              }
            }
            return step
          })
          
          // 如果没有找到现有 step，则添加新 step（容错）
          if (!updatedThinking.find((s: ThinkingStep) => s.id === taskData.task_id)) {
            updatedThinking.push({
              id: taskData.task_id,
              expertType: taskData.expert_type,
              expertName: getExpertConfig(taskData.expert_type).name,
              content: taskData.output || taskData.description,
              timestamp: taskData.completed_at,
              status: 'completed',
              type: getExpertType(taskData.expert_type),
              duration: taskData.duration_ms
            })
          }
          
          updateMessageMetadata(messageId, { 
            thinking: updatedThinking.slice(-50)
          })
        }
        break
      }
      
      case 'task.failed': {
        const taskData = event.data
        
        // 1. 更新 taskStore
        taskActions.failTask(taskData)
        
        // 2. 更新当前消息的 thinking（更新现有 step，而不是创建新 step）
        const messageId = getLastAssistantMessageId()
        if (messageId) {
          const message = chatStoreRef.current.messages.find(m => m.id === messageId)
          const existingThinking = message?.metadata?.thinking || []
          
          // 🔥 查找并更新现有 step
          const updatedThinking = existingThinking.map((step: ThinkingStep) => {
            if (step.id === taskData.task_id) {
              return {
                ...step,
                status: 'failed' as const,
                content: `${taskData.description}\n\n错误: ${taskData.error}`
              }
            }
            return step
          })
          
          // 如果没有找到现有 step，则添加新 step（容错）
          if (!updatedThinking.find((s: ThinkingStep) => s.id === taskData.task_id)) {
            updatedThinking.push({
              id: taskData.task_id,
              expertType: taskData.expert_type,
              expertName: getExpertConfig(taskData.expert_type).name,
              content: `${taskData.description}\n\n错误: ${taskData.error}`,
              timestamp: taskData.failed_at,
              status: 'failed',
              type: getExpertType(taskData.expert_type)
            })
          }
          
          updateMessageMetadata(messageId, { 
            thinking: updatedThinking.slice(-50)
          })
        }
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
