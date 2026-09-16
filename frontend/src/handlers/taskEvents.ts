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
  TaskProgressEvent,
  TaskCompletedEvent,
  TaskFailedEvent
} from './types'
import type { HandlerContext } from './types'
import { getLastAssistantMessage } from './utils'
import { t } from '@/i18n'
import { logger } from '@/utils/logger'
import type { ThinkingStep } from '@/types'

/**
 * 处理 plan.created 事件
 * 初始化任务计划
 */
export function handlePlanCreated(
  event: PlanCreatedEvent,
  context: HandlerContext
): void {
  const { taskStore, chatStore, debug } = context
  // 本地任务副本已删除（见 store/taskStore.ts 的说明）：这里只需标记「已初始化 +
  // 复杂模式」，任务清单本身由服务端与 pendingPlan 承载
  const { setMode } = taskStore
  const { updateMessageMetadata } = chatStore

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
        content: t('thinkingPlanDone')
      }
      updateMessageMetadata(lastAi.id, { thinking })
    }
  }

  if (debug) {
    logger.debug('[TaskEvents] 任务计划已初始化:', event.data.execution_plan_id)
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
  const { chatStore, debug } = context
  const { updateMessageMetadata } = chatStore

  // 🔥 性能优化：使用缓存 ID 查找最后一条助手消息
  const lastAi = getLastAssistantMessage(chatStore)

  if (lastAi) {
    const thinking = [...(lastAi.message.metadata?.thinking || [])]

    // 创建新的 planning step
    const planStep = {
      id: `plan-${event.data.execution_plan_id}`,
      expertType: 'planner',
      expertName: t('thinkingPlanning'),
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
    logger.debug('[TaskEvents] 规划开始，title 常驻:', event.data.execution_plan_id)
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
  const { chatStore, debug } = context
  const { updateMessageMetadata } = chatStore

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
  const { addRunningTaskId } = taskStore
  const { updateMessageMetadata } = chatStore

  addRunningTaskId(event.data.task_id)

  // 🔥 性能优化：使用缓存 ID 查找最后一条助手消息
  const lastAi = getLastAssistantMessage(chatStore)

  if (lastAi) {
    const existingThinking = lastAi.message.metadata?.thinking || []
    // 检查是否已存在该 task 的 step
    const existingIndex = existingThinking.findIndex(
      (s: ThinkingStep) => s.id === event.data.task_id
    )

    if (existingIndex < 0) {
      const newStep = {
        id: event.data.task_id,
        expertType: event.data.expert_type,
        expertName: event.data.expert_type,
        content: event.data.description,
        // 描述单独留一份：完成时 content 会被产出覆盖，而按专家分组的行标题要的是任务本身
        taskDescription: event.data.description,
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
 * 处理 task.progress 事件（可选事件：阶段性提示）
 *
 * 当前**只记录日志，不落任何状态**：它此前唯一的去处是本地任务副本的
 * `task.output`，而那份副本没有任何消费者（已删除）。处理器保留是因为事件本身
 * 仍在协议里——将来要做进度条时，在这里接一个真有 UI 消费者的字段即可，
 * 不要再往 store 里塞只写不读的副本。
 */
export function handleTaskProgress(
  event: TaskProgressEvent,
  context: HandlerContext
): void {
  const { debug } = context

  if (debug) {
    logger.debug('[TaskEvents] 任务进度:', event.data.task_id, event.data.progress)
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
  const { removeRunningTaskId } = taskStore
  const { updateMessageMetadata } = chatStore

  removeRunningTaskId(event.data.task_id)

  // 🔥 性能优化：使用缓存 ID 查找最后一条助手消息
  const lastAi = getLastAssistantMessage(chatStore)

  if (lastAi?.message.metadata?.thinking) {
    const thinking = [...lastAi.message.metadata.thinking]
    const taskStepIndex = thinking.findIndex(
      (s: ThinkingStep) => s.id === event.data.task_id
    )

    if (taskStepIndex >= 0) {
      thinking[taskStepIndex] = {
        ...thinking[taskStepIndex],
        status: 'completed',
        content: event.data.output || t('thinkingTaskDone'),
        // 耗时此前从未赋值（ThinkingProcess 有渲染逻辑但拿不到数据），
        // 于是「这一步花了多久」在执行期间完全不可见
        duration: event.data.duration_ms ?? thinking[taskStepIndex].duration
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
    logger.debug('[TaskEvents] 任务完成:', event.data.task_id)
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
  const { removeRunningTaskId } = taskStore

  removeRunningTaskId(event.data.task_id)

  logger.error('[TaskEvents] 任务失败:', event.data.task_id, event.data.error)
}
