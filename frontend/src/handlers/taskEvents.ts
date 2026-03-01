/**
 * Task 相关事件处理器
 * 
 * 处理的事件类型：
 * - plan.created: 初始化任务计划
 * - plan.started: 规划开始
 * - plan.thinking: 规划思考流
 * - task.started: 任务开始
 * - task.completed: 任务完成
 * - task.failed: 任务失败
 */

import type {
  PlanCreatedEvent,
  PlanStartedEvent,
  PlanThinkingEvent,
  TaskStartedEvent,
  TaskCompletedEvent,
  TaskFailedEvent
} from './types'
import type { HandlerContext } from './types'
import { getLastAssistantMessage } from './utils'
import { logger } from '@/utils/logger'

/**
 * 处理 plan.created 事件
 * 初始化任务计划
 */
export function handlePlanCreated(
  event: PlanCreatedEvent,
  context: HandlerContext
): void {
  const { taskStore, chatStore, debug } = context
  const { initializePlan, setIsInitialized, setMode } = taskStore
  const { updateMessageMetadata } = chatStore

  // TaskSlice: 初始化任务数据
  initializePlan(event.data)

  // UISlice: 标记初始化完成并设置模式
  setIsInitialized(true)
  setMode('complex')

  // 🔥 性能优化：使用缓存 ID 查找最后一条助手消息
  const lastAi = getLastAssistantMessage(chatStore)

  if (lastAi?.message.metadata?.thinking) {
    const thinking = [...lastAi.message.metadata.thinking]
    const planStepIndex = thinking.findIndex((s) => s.type === 'planning')

    if (planStepIndex >= 0) {
      thinking[planStepIndex] = {
        ...thinking[planStepIndex],
        status: 'completed',
        content: '任务规划完成'
      }
      updateMessageMetadata(lastAi.id, { thinking })
    }
  }

  if (debug) {
    logger.debug('[TaskEvents] 任务计划已初始化:', event.data.session_id)
  }
}

/**
 * 处理 plan.started 事件
 * 创建 thinking step，title 常驻，content 初始为空
 */
export function handlePlanStarted(
  event: PlanStartedEvent,
  context: HandlerContext
): void {
  const { taskStore, chatStore, debug } = context
  const { startPlan } = taskStore
  const { updateMessageMetadata } = chatStore

  // v3.2.0: 新规划开始
  // 🔥 注意：不要调用 resetAll()，否则会清空 plan.created 创建的任务
  startPlan(event.data)

  // 🔥 性能优化：使用缓存 ID 查找最后一条助手消息
  const lastAi = getLastAssistantMessage(chatStore)

  if (lastAi) {
    const thinking = [...(lastAi.message.metadata?.thinking || [])]

    // 创建新的 planning step
    const planStep = {
      id: `plan-${event.data.session_id}`,
      expertType: 'planner',
      expertName: '任务规划',
      content: '',
      timestamp: new Date().toISOString(),
      status: 'running' as const,
      type: 'planning' as const
    }

    // 查找是否已存在规划步骤，避免重复
    const existingIndex = thinking.findIndex((s) => s.type === 'planning')
    if (existingIndex >= 0) {
      thinking[existingIndex] = { ...thinking[existingIndex], ...planStep }
    } else {
      thinking.push(planStep)
    }

    updateMessageMetadata(lastAi.id, { thinking })
  }

  if (debug) {
    logger.debug('[TaskEvents] 规划开始，title 常驻:', event.data.session_id)
  }
}

/**
 * 处理 plan.thinking 事件
 * 追加 delta 到 content 字段，不覆盖 title
 */
export function handlePlanThinking(
  event: PlanThinkingEvent,
  context: HandlerContext
): void {
  const { taskStore, chatStore, debug } = context
  const { appendPlanThinking } = taskStore
  const { updateMessageMetadata } = chatStore

  appendPlanThinking(event.data)

  if (debug) {
    logger.debug('[TaskEvents] 🧠 plan.thinking:', event.data.delta.substring(0, 30) + '...')
  }

  // 🔥 性能优化：使用缓存 ID 查找最后一条助手消息
  const lastAi = getLastAssistantMessage(chatStore)

  if (lastAi?.message.metadata?.thinking) {
    const thinking = [...lastAi.message.metadata.thinking]
    const planStepIndex = thinking.findIndex((s) => s.type === 'planning')

    if (planStepIndex >= 0) {
      // 🔥 只更新 content，不覆盖 title (expertName)
      thinking[planStepIndex] = {
        ...thinking[planStepIndex],
        content: thinking[planStepIndex].content + event.data.delta
      }
      updateMessageMetadata(lastAi.id, { thinking })
      if (debug) {
        logger.debug('[TaskEvents] thinking content 已更新')
      }
    } else if (debug) {
      logger.warn('[TaskEvents] 未找到 planning step')
    }
  } else if (debug) {
    logger.warn('[TaskEvents] 最后一条消息没有 thinking 元数据')
  }
}

/**
 * 处理 task.started 事件
 * 更新任务状态为 running
 */
export function handleTaskStarted(
  event: TaskStartedEvent,
  context: HandlerContext
): void {
  const { taskStore, chatStore, debug } = context
  const { startTask, addRunningTaskId } = taskStore
  const { updateMessageMetadata } = chatStore

  startTask(event.data)
  addRunningTaskId(event.data.task_id)

  // 🔥 性能优化：使用缓存 ID 查找最后一条助手消息
  const lastAi = getLastAssistantMessage(chatStore)

  if (lastAi) {
    const existingThinking = lastAi.message.metadata?.thinking || []
    // 检查是否已存在该 task 的 step
    const existingIndex = existingThinking.findIndex(
      (s: any) => s.id === event.data.task_id
    )

    if (existingIndex < 0) {
      const newStep = {
        id: event.data.task_id,
        expertType: event.data.expert_type,
        expertName: event.data.expert_type,
        content: event.data.description,
        timestamp: event.data.started_at,
        status: 'running' as const,
        type: 'execution' as const
      }
      updateMessageMetadata(lastAi.id, {
        thinking: [...existingThinking, newStep]
      })
      if (debug) {
        logger.debug(
          '[TaskEvents] task.started: 添加 task step 到 thinking:',
          event.data.task_id
        )
      }
    }
  }

  if (debug) {
    logger.debug('[TaskEvents] 任务开始:', event.data.task_id)
  }
}

/**
 * 处理 task.completed 事件
 * 更新任务状态为 completed，并更新进度
 */
export function handleTaskCompleted(
  event: TaskCompletedEvent,
  context: HandlerContext
): void {
  const { taskStore, chatStore, debug } = context
  const { completeTask, setProgress, tasksCache, removeRunningTaskId } = taskStore
  const { updateMessageMetadata } = chatStore

  completeTask(event.data)
  removeRunningTaskId(event.data.task_id)

  // 🔥 更新进度
  const completedCount = tasksCache.filter((t) => t.status === 'completed').length
  const totalCount = tasksCache.length
  if (totalCount > 0) {
    setProgress({ current: completedCount, total: totalCount })
  }

  // 🔥 性能优化：使用缓存 ID 查找最后一条助手消息
  const lastAi = getLastAssistantMessage(chatStore)

  if (lastAi?.message.metadata?.thinking) {
    const thinking = [...lastAi.message.metadata.thinking]
    const taskStepIndex = thinking.findIndex(
      (s: any) => s.id === event.data.task_id
    )

    if (taskStepIndex >= 0) {
      thinking[taskStepIndex] = {
        ...thinking[taskStepIndex],
        status: 'completed',
        content: event.data.output || '任务执行完成'
      }
      updateMessageMetadata(lastAi.id, { thinking })
      if (debug) {
        logger.debug(
          '[TaskEvents] task.completed: task step 已标记为 completed:',
          event.data.task_id
        )
      }
    }
  }

  if (debug) {
    const completedCount = taskStore.tasksCache.filter(
      (t) => t.status === 'completed'
    ).length
    const totalCount = taskStore.tasksCache.length
    logger.debug(
      '[TaskEvents] 任务完成:',
      event.data.task_id,
      '进度:',
      completedCount,
      '/',
      totalCount
    )
  }
}

/**
 * 处理 task.failed 事件
 * 更新任务状态为 failed
 */
export function handleTaskFailed(
  event: TaskFailedEvent,
  context: HandlerContext
): void {
  const { taskStore } = context
  const { failTask, removeRunningTaskId } = taskStore

  failTask(event.data)
  removeRunningTaskId(event.data.task_id)

  logger.error('[TaskEvents] 任务失败:', event.data.task_id, event.data.error)
}
