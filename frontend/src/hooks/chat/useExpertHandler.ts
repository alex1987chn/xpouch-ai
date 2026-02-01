/**
 * 专家事件处理 Hook
 * v3.0: 只处理新协议事件，更新 taskStore
 */

import { useCallback, useRef, useMemo } from 'react'
import { useChatStore } from '@/store/chatStore'
import { useCanvasStore } from '@/store/canvasStore'
import { useTaskStore } from '@/store/taskStore'
import { getExpertConfig } from '@/constants/systemAgents'
import type { AnyServerEvent } from '@/types/events'
import { logger } from '@/utils/logger'
import { generateUUID } from '@/utils'

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
  // v3.0: 使用 ref 保持稳定的引用，避免订阅导致重渲染
  const updateMessageMetadataRef = useRef(useChatStore.getState().updateMessageMetadata)
  const updateMessageMetadata = updateMessageMetadataRef.current
  
  // 使用 ref 获取所有 store actions
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

  // 获取最后一条 AI 消息的 ID
  const getLastAssistantMessageId = () => {
    const state = useChatStore.getState()
    for (let i = state.messages.length - 1; i >= 0; i--) {
      if (state.messages[i].role === 'assistant') {
        return state.messages[i].id
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
    debug('处理事件:', event.type, event)

    switch (event.type) {
      case 'router.decision': {
        // mode 已经在 eventHandlers.ts 中设置
        // 这里可以触发其他副作用（如展开右侧面板）
        debug('路由决策:', event.data.decision)
        break
      }
      
      case 'plan.created': {
        const planData = event.data
        
        // 1. 更新 taskStore（初始化任务计划）
        taskActions.initializePlan(planData)
        
        // 2. 添加到当前消息的 thinking
        const messageId = getLastAssistantMessageId()
        if (messageId) {
          const message = useChatStore.getState().messages.find(m => m.id === messageId)
          const existingThinking = message?.metadata?.thinking || []
          
          // 构建任务计划 JSON
          const taskPlanJson = {
            tasks: planData.tasks.map((t: any) => ({
              expert_type: t.expert_type,
              description: t.description,
              input_data: {},
              priority: t.sort_order || 0
            })),
            strategy: planData.summary || '复杂任务规划',
            estimated_steps: planData.estimated_steps
          }
          
          const newStep = {
            id: generateUUID(),
            expertType: 'planner',
            expertName: 'Task Planning',
            content: JSON.stringify(taskPlanJson, null, 2),
            timestamp: new Date().toISOString(),
            status: 'completed' as const
          }
          
          updateMessageMetadata(messageId, { 
            thinking: [...existingThinking, newStep].slice(-50)
          })
        }
        break
      }
      
      case 'task.started': {
        const taskData = event.data
        
        // 1. 更新 taskStore
        taskActions.startTask(taskData)
        
        // 2. 添加到当前消息的 thinking
        const messageId = getLastAssistantMessageId()
        if (messageId) {
          const message = useChatStore.getState().messages.find(m => m.id === messageId)
          const existingThinking = message?.metadata?.thinking || []
          
          const newStep = {
            id: generateUUID(),
            expertType: taskData.expert_type,
            expertName: getExpertConfig(taskData.expert_type).name,
            content: `开始执行: ${taskData.description}`,
            timestamp: new Date().toISOString(),
            status: 'running' as const
          }
          
          updateMessageMetadata(messageId, { 
            thinking: [...existingThinking, newStep].slice(-50)
          })
        }
        break
      }
      
      case 'task.completed': {
        const taskData = event.data
        
        // 1. 更新 taskStore
        taskActions.completeTask(taskData)
        
        // 2. 添加到当前消息的 thinking
        const messageId = getLastAssistantMessageId()
        if (messageId) {
          const message = useChatStore.getState().messages.find(m => m.id === messageId)
          const existingThinking = message?.metadata?.thinking || []
          
          const newStep = {
            id: generateUUID(),
            expertType: taskData.expert_type,
            expertName: getExpertConfig(taskData.expert_type).name,
            content: `执行完成: ${taskData.description} (${taskData.duration_ms}ms)`,
            timestamp: new Date().toISOString(),
            status: 'completed' as const
          }
          
          updateMessageMetadata(messageId, { 
            thinking: [...existingThinking, newStep].slice(-50)
          })
        }
        break
      }
      
      case 'task.failed': {
        const taskData = event.data
        
        // 1. 更新 taskStore
        taskActions.failTask(taskData)
        
        // 2. 添加到当前消息的 thinking
        const messageId = getLastAssistantMessageId()
        if (messageId) {
          const message = useChatStore.getState().messages.find(m => m.id === messageId)
          const existingThinking = message?.metadata?.thinking || []
          
          const newStep = {
            id: generateUUID(),
            expertType: taskData.expert_type,
            expertName: getExpertConfig(taskData.expert_type).name,
            content: `执行失败: ${taskData.description} - ${taskData.error}`,
            timestamp: new Date().toISOString(),
            status: 'failed' as const
          }
          
          updateMessageMetadata(messageId, { 
            thinking: [...existingThinking, newStep].slice(-50)
          })
        }
        break
      }
      
      case 'artifact.generated': {
        const artifactData = event.data
        const expertType = artifactData.expert_type
        
        // 1. 更新 taskStore
        taskActions.addArtifact(artifactData)
        
        // 2. 同步到 canvasStore（用于 Artifact 展示）
        const artifact = {
          id: artifactData.artifact.id,
          timestamp: new Date().toISOString(),
          type: artifactData.artifact.type,
          title: artifactData.artifact.title || `${expertType} 产物`,
          content: artifactData.artifact.content,
          language: artifactData.artifact.language
        }
        // 使用 getState() 避免订阅
        useCanvasStore.getState().addArtifactsBatch(expertType, [artifact])
        
        // 3. 自动选中该任务
        taskActions.selectTask(artifactData.task_id)
        break
      }
      
      case 'router.decision': {
        debug('Router 决策:', event.data.decision)
        // 可以在这里触发 UI 变化（如展开右侧面板）
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
