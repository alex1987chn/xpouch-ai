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
import { isSameId } from '@/utils/normalize'
import { t } from '@/i18n'
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
  // 本地任务副本已删除（见 store/taskStore.ts 的说明）：这里只需标记「已初始化 +
  // 复杂模式」，任务清单本身由服务端与 pendingPlan 承载
  const { setMode } = taskStore
  const { updateMessageMetadata, renameMessageId } = chatStore

  setMode('complex')

  // 🔥 性能优化：使用缓存 ID 查找最后一条助手消息
  const lastAi = getLastAssistantMessage(chatStore)

  // 思考载体消息改写：commander 已把本轮思考载体落库（排在专家消息之前），
  // 事件携带其库内 id——占位消息原位改写成它，此后实时流与刷新回放共用
  // 同一条消息（两态同序的锚点）。无 id（插入失败的兜底）则保留占位
  let thinkingTargetId = lastAi?.id
  if (event.data.message_id != null && lastAi?.id) {
    const carrierId = String(event.data.message_id)
    if (!isSameId(lastAi.id, carrierId)) {
      renameMessageId(lastAi.id, carrierId)
      thinkingTargetId = carrierId
    }
  }

  if (lastAi?.message.metadata?.thinking) {
    const thinking = [...lastAi.message.metadata.thinking]
    const planStepIndex = thinking.findIndex((s) => s.type === 'planning')

    if (planStepIndex >= 0) {
      thinking[planStepIndex] = {
        ...thinking[planStepIndex],
        status: 'completed',
        content: t('thinkingPlanDone')
      }
      updateMessageMetadata(thinkingTargetId ?? '', { thinking })
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
  const { addMessage } = chatStore

  addRunningTaskId(event.data.task_id)

  // 专家执行消息（真相源=消息表）：事件携带后端插入的 message_id 与载荷，
  // 前端外加同一条消息——与刷新后从库读到的完全一致。
  // message_id 为空（插入失败/旧后端）时不加：宁可没有，不加双轨数据。
  if (event.data.message_id != null) {
    addMessage({
      id: String(event.data.message_id),
      role: 'assistant',
      content: event.data.description,
      extra_data: {
        message_kind: 'expert_result',
        expert_type: event.data.expert_type,
        task_id: event.data.task_id,
        task_description: event.data.description,
        sort_order: event.data.sort_order ?? 0,
        total_steps: event.data.total_steps ?? 0,
        status: 'running',
      },
    })
    if (debug) {
      logger.debug(
        '[TaskEvents] task.started: 专家消息已加入消息流:',
        event.data.message_id
      )
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
  const { updateMessageExtra } = chatStore

  removeRunningTaskId(event.data.task_id)

  // 事件载荷=消息终态（后端在专家消息更新完成后才发射），前端原位覆盖
  if (event.data.message_id != null) {
    const rawCalls = event.data.tool_calls
    updateMessageExtra(String(event.data.message_id), {
      status: 'completed',
      artifact_ids: event.data.artifact_ids ?? [],
      tool_stats: event.data.tool_stats
        ? {
            count: event.data.tool_stats.count ?? 0,
            total_ms: event.data.tool_stats.total_ms ?? 0,
            failed: event.data.tool_stats.failed ?? 0,
          }
        : null,
      // 逐次明细（服务端账本聚合的快照，取代实时累积的 metadata.toolCalls）
      tool_calls: (rawCalls ?? []).map(c => ({
        tool: String((c as { tool?: unknown }).tool ?? 'unknown'),
        duration_ms: Number((c as { duration_ms?: unknown }).duration_ms ?? 0),
        success: (c as { success?: unknown }).success === true,
        source: String((c as { source?: unknown }).source ?? 'builtin'),
      })),
      duration_ms: event.data.duration_ms,
      // 产出标题（落库后回填的权威值；事件未带时兜底 output 首个非空行）
      summary: event.data.summary ?? (
        ((event.data.output || '').split('\n').find(l => l.trim()) || '').slice(0, 120) || null
      ),
    })
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
  const { taskStore, chatStore, debug } = context
  const { removeRunningTaskId } = taskStore
  const { updateMessageExtra } = chatStore

  removeRunningTaskId(event.data.task_id)

  if (event.data.message_id != null) {
    updateMessageExtra(String(event.data.message_id), {
      status: 'failed',
      error: event.data.error,
    })
  }

  if (debug) {
    logger.debug('[TaskEvents] 任务失败:', event.data.task_id, event.data.error)
  }
}
