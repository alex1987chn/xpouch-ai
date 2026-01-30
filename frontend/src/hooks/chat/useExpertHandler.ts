/**
 * 专家事件处理 Hook
 * 负责处理专家激活、专家完成、任务计划等事件
 */

import { useCallback } from 'react'
import { useChatStore } from '@/store/chatStore'
import { useCanvasStore } from '@/store/canvasStore'
import { getExpertConfig, createExpertResult } from '@/constants/systemAgents'
import type { ExpertEvent, TaskStartEvent, TaskPlanEvent, ExpertActivatedEvent, ExpertCompletedEvent } from '@/types'
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
  const { addMessage } = useChatStore()
  const {
    addExpertResult,
    updateExpertResult,
    selectExpert,
    selectArtifactSession,
    setArtifact,
  } = useCanvasStore()

  /**
   * 处理所有类型的专家事件
   */
  const handleExpertEvent = useCallback(async (
    expertEvent: ExpertEvent,
    conversationMode: 'simple' | 'complex'
  ) => {
    if (conversationMode !== 'complex') return

    debug('收到专家事件:', expertEvent.type, expertEvent)

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

    // 处理任务计划事件
    if (expertEvent.type === 'task_plan') {
      const taskPlan = expertEvent as TaskPlanEvent
      const tasks = taskPlan.tasks || []

      // 构建简单的任务列表消息
      let taskListMessage = '📋 任务计划：\n'
      tasks.forEach((task, index) => {
        taskListMessage += `${index + 1}. ${task.description}\n`
      })

      addMessage({
        id: generateUUID(),
        role: 'system',
        content: taskListMessage
      })
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

      // 添加工作流状态消息
      const expertConfig = getExpertConfig(completedEvent.expertId)
      const expertName = expertConfig.name
      const duration = completedEvent.duration_ms ? `${(completedEvent.duration_ms / 1000).toFixed(1)}` : ''
      const expertId = completedEvent.expertId
      const description = completedEvent.description || ''

      // 简洁的完成消息，输出内容在 artifact 区域展示
      let completionMessage = `${expertName}专家完成任务【${description}】，用时${duration}秒。交付物在右侧可查看 [查看交付物](#${expertId})`

      // 失败时显示错误信息
      if (completedEvent.status === 'failed') {
        if (completedEvent.error) {
          completionMessage += `\n\n失败原因：${completedEvent.error}`
        } else {
          completionMessage += `\n\n任务执行失败，请查看详细错误信息`
        }
      }

      addMessage({
        id: generateUUID(),
        role: 'system',
        content: completionMessage,
        metadata: {
          type: 'expert_completion',
          expertId: expertId
        }
      })

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
