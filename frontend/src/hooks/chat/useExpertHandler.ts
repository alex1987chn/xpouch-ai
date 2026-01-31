/**
 * 专家事件处理 Hook
 * 负责处理专家激活、专家完成、任务计划等事件
 */

import { useCallback } from 'react'
import { useChatStore } from '@/store/chatStore'
import { useCanvasStore } from '@/store/canvasStore'
import { getExpertConfig, createExpertResult } from '@/constants/systemAgents'
import type { ExpertEvent, TaskStartEvent, TaskPlanEvent, ExpertActivatedEvent, ExpertCompletedEvent, RouterDecisionEvent } from '@/types'
import { logger } from '@/utils/logger'
import { generateUUID } from '@/utils'

// 开发环境判断
const DEBUG = import.meta.env.VITE_DEBUG_MODE === 'true'

// 统一的调试日志函数
const debug = DEBUG
  ? (...args: unknown[]) => logger.debug('[useExpertHandler]', ...args)
  : () => {}

/**
 * 专家事件处理 Hook
 */
export function useExpertHandler() {
  const { addMessage, messages, updateMessageMetadata } = useChatStore()
  const {
    addExpertResult,
    updateExpertResult,
    selectExpert,
    selectArtifactSession,
    setArtifact,
  } = useCanvasStore()
  
  // 获取最后一条 AI 消息的 ID，用于更新 thinking
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
   * 处理所有类型的专家事件
   */
  const handleExpertEvent = useCallback(async (
    expertEvent: ExpertEvent,
    conversationMode: 'simple' | 'complex'
  ) => {
    debug('收到专家事件:', expertEvent.type, expertEvent)

    // 👈 处理 Router 决策事件（简单模式 vs 复杂模式）
    if (expertEvent.type === 'router_decision') {
      const routerEvent = expertEvent as RouterDecisionEvent
      debug('Router 决策:', routerEvent.decision)

      // 如果决策为 complex，自动切换到复杂模式 UI
      if (routerEvent.decision === 'complex') {
        // TODO: 这里可以触发 UI 变化，例如展开右侧 Sidebar
        // 可以使用全局状态或事件来通知 UnifiedChatPage
        debug('切换到复杂模式 UI')
      }
      return
    }

    // 👈 修复：移除 conversationMode 检查，因为该参数始终为 'simple'
    // 实际上，如果收到了这些专家事件，说明后端已经进入 complex 模式
    // 注：保留参数以兼容接口，但不再用于判断是否处理

    // 处理任务开始事件
    if (expertEvent.type === 'task_start') {
      const taskInfo = expertEvent as TaskStartEvent
      const expertType = taskInfo.expert_type
      const description = taskInfo.description || taskInfo.task_name || '执行任务'

      // 设置当前执行的专家信息（用于 loading 气泡展示）
      const newExpert = createExpertResult(expertType, 'running')
      newExpert.description = description
      updateExpertResult(expertType, newExpert)
      return
    }

    // 处理任务计划事件 - 存储到消息的 thinking 中
    if (expertEvent.type === 'task_plan') {
      const taskPlan = expertEvent as TaskPlanEvent
      const tasks = taskPlan.tasks || []

      debug('收到任务计划:', tasks)
      
      // 存储到当前消息的 thinking 中
      const messageId = getLastAssistantMessageId()
      if (messageId) {
        const existingThinking = useChatStore.getState().messages.find(m => m.id === messageId)?.metadata?.thinking || []
        const newStep = {
          id: generateUUID(),
          expertType: 'planner',
          expertName: '任务规划',
          content: `任务计划：\n${tasks.map((t: any, i: number) => `${i + 1}. ${t.expert_type}: ${t.description}`).join('\n')}`,
          timestamp: new Date().toISOString(),
          status: 'completed' as const
        }
        updateMessageMetadata(messageId, { 
          thinking: [...existingThinking, newStep]
        })
      }
      return
    }

    // 处理专家激活事件
    if (expertEvent.type === 'expert_activated') {
      const activatedEvent = expertEvent as ExpertActivatedEvent
      const newExpert = createExpertResult(activatedEvent.expertId, 'running')
      
      // 如果专家事件包含描述信息，设置描述
      if (activatedEvent.description) {
        newExpert.description = activatedEvent.description
      }
      
      addExpertResult(newExpert)
      return
    }

    // 处理专家完成事件
    if (expertEvent.type === 'expert_completed') {
      const completedEvent = expertEvent as ExpertCompletedEvent

      debug('处理专家完成事件:', completedEvent.expertId, completedEvent.status)

      // 将专家执行过程添加到当前消息的 thinking 中
      const messageId = getLastAssistantMessageId()
      if (messageId) {
        const expertConfig = getExpertConfig(completedEvent.expertId)
        const expertName = expertConfig.name
        const description = completedEvent.description || ''
        const existingThinking = useChatStore.getState().messages.find(m => m.id === messageId)?.metadata?.thinking || []
        
        const newStep = {
          id: generateUUID(),
          expertType: completedEvent.expertId,
          expertName: expertName,
          content: `执行${description ? `【${description}】` : '任务'}${completedEvent.status === 'failed' ? `失败: ${completedEvent.error || ''}` : '完成'}`,
          timestamp: new Date().toISOString(),
          status: completedEvent.status as 'completed' | 'failed'
        }
        
        updateMessageMetadata(messageId, {
          thinking: [...existingThinking, newStep]
        })
      }

      // 处理 allArtifacts（新架构：批量添加到 ArtifactSession）
      if (completedEvent.allArtifacts && Array.isArray(completedEvent.allArtifacts) && completedEvent.allArtifacts.length > 0) {
        const artifacts = completedEvent.allArtifacts.map((item) => ({
          id: generateUUID(),
          timestamp: new Date().toISOString(),
          type: item.type,
          title: item.title,
          content: item.content,
          language: item.language
        }))

        // 批量添加 artifacts 到 ArtifactSession
        completedEvent.allArtifacts.forEach((item) => {
          // 兼容旧逻辑：更新 Canvas 显示代码
          setArtifact(item.type, item.content)
        })

        // 检查是否是第一个专家完成并添加artifacts，如果是则自动选中
        const expertResults = useCanvasStore.getState().expertResults
        const completedExperts = expertResults.filter(e => 
          e.status === 'completed' || e.status === 'failed'
        )
        
        // 如果这是第一个完成的专家，自动选中它以展示第一个artifact
        if (completedExperts.length === 1 && completedExperts[0].expertType === expertId) {
          selectExpert(expertId)
          selectArtifactSession(expertId)
        }
      }

      // 更新专家状态为完成，包含完整信息
      updateExpertResult(completedEvent.expertId, {
        status: (completedEvent.status === 'failed' ? 'failed' : 'completed') as 'completed' | 'failed',
        completedAt: new Date().toISOString(),
        duration: completedEvent.duration_ms,
        error: completedEvent.error,
        output: completedEvent.output,
        artifacts: completedEvent.allArtifacts ? completedEvent.allArtifacts.map((item) => ({
          id: generateUUID(),
          timestamp: new Date().toISOString(),
          type: item.type,
          title: item.title,
          content: item.content,
          language: item.language
        })) : undefined
      })

      // 检查是否所有专家都已完成，如果是则显示总完成消息
      const expertResults = useCanvasStore.getState().expertResults
      const allCompleted = expertResults.every(expert =>
        expert.status === 'completed' || expert.status === 'failed'
      )

      // 只有当所有专家都完成，且当前专家是最后一个完成的专家时，才显示总完成消息
      if (allCompleted && expertResults.length > 0) {
        const firstExpert = expertResults[0]
        selectExpert(firstExpert.expertType)
        selectArtifactSession(firstExpert.expertType)
      }
    }
  }, [addMessage, addExpertResult, updateExpertResult, selectExpert, selectArtifactSession, setArtifact])

  return {
    handleExpertEvent,
  }
}
