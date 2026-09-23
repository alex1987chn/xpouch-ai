/**
 * Tool 相关事件处理器
 *
 * 处理的事件类型：
 * - tool.calling: 单个 tool_call 开始（attempt 标注重试轮次）
 * - tool.result: 单个 tool_call 结束（耗时/成败）
 *
 * 数据落点：按 task_id 定位消息流里的**专家消息**（message_kind='expert_result'），
 * 把「当前工具活动」写进它的运行时 metadata（前端态）——完成后被 extra_data 里的
 * tool_stats 终态覆盖渲染，两者不混：extra_data 是服务端真相，metadata 只放
 * 执行期间的实时指示（calling 中转圈）。
 *
 * 历史回看的工具明细由运行时间线（runevent 账本）承载，与实时流分工不重复。
 */

import type { ToolCallingEvent, ToolResultEvent } from './types'
import type { HandlerContext } from './types'
import { logger } from '@/utils/logger'
import type { Message, MessageMetadata } from '@/types'

/** 当前工具活动（挂专家消息 metadata 的运行时态；完成即被终态渲染取代） */
type ToolActivity = NonNullable<MessageMetadata['toolActivity']>

function findExpertMessageByTask(
  messages: Message[],
  taskId: string
): Message | undefined {
  return messages.find(
    m =>
      m.role === 'assistant' &&
      (m.extra_data as { message_kind?: string } | undefined)?.message_kind ===
        'expert_result' &&
      (m.extra_data as { task_id?: string }).task_id === taskId
  )
}

function applyToolActivity(
  context: HandlerContext,
  taskId: string,
  activity: ToolActivity,
  expectTool?: string
): boolean {
  const { chatStore } = context
  const { messages, updateMessageMetadata } = chatStore
  const msg = findExpertMessageByTask(messages, taskId)
  if (!msg || msg.id == null) return false

  // 乱序防护：迟到的旧工具 result 不覆盖当前 calling（重试序列里
  // attempt=1 的 result 晚于 attempt=2 的 calling 到达时）
  const current = msg.metadata?.toolActivity as ToolActivity | undefined
  if (expectTool && current && current.tool !== expectTool) return false

  updateMessageMetadata(msg.id, { toolActivity: activity })
  return true
}

export function handleToolCalling(event: ToolCallingEvent, context: HandlerContext): void {
  const { debug } = context
  const ok = applyToolActivity(
    context,
    event.data.task_id,
    {
      tool: event.data.tool,
      source: event.data.source,
      state: 'calling',
      attempt: event.data.attempt,
    },
  )
  if (debug && ok) {
    logger.debug('[ToolEvents] tool.calling:', event.data.tool, 'attempt', event.data.attempt)
  }
}

export function handleToolResult(event: ToolResultEvent, context: HandlerContext): void {
  const { debug } = context
  const ok = applyToolActivity(
    context,
    event.data.task_id,
    {
      tool: event.data.tool,
      source: event.data.source,
      state: 'done',
      durationMs: event.data.duration_ms,
      success: event.data.success,
    },
    event.data.tool,
  )
  if (debug && ok) {
    logger.debug('[ToolEvents] tool.result:', event.data.tool, event.data.success)
  }
}
