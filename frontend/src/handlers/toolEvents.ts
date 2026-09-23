/**
 * Tool 相关事件处理器
 *
 * 处理的事件类型：
 * - tool.calling: 单个 tool_call 开始（attempt 标注重试轮次）
 * - tool.result: 单个 tool_call 结束（耗时/成败）
 *
 * 数据落点：按 task_id 定位消息流里的**专家消息**（message_kind='expert_result'），
 * 把工具活动**逐次累积**进它的运行时 metadata.toolCalls（calling 项实时追加、
 * result 到达转 done）——完成后被 extra_data 里的 tool_calls / tool_stats 终态
 * 取代渲染，两者不混：extra_data 是服务端真相（刷新后也从这里读），metadata
 * 只放执行期间的实时序列。
 *
 * 历史回看的工具明细由运行时间线（runevent 账本）承载，与实时流分工不重复。
 */

import type { ToolCallingEvent, ToolResultEvent } from './types'
import type { HandlerContext } from './types'
import { logger } from '@/utils/logger'
import type { Message, ToolCallRecord } from '@/types'

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

/** 累积一条工具活动到专家消息（calling 追加 / result 就地转 done）。 */
function appendToolCall(
  context: HandlerContext,
  taskId: string,
  record: ToolCallRecord,
): boolean {
  const { chatStore } = context
  const { messages, updateMessageMetadata } = chatStore
  const msg = findExpertMessageByTask(messages, taskId)
  if (!msg || msg.id == null) return false

  const calls = [...(msg.metadata?.toolCalls ?? [])]
  if (record.status === 'done') {
    // result 到达：找同工具最后一个 calling 项转 done（乱序防护：迟到的
    // 旧 result 不动更新的 calling——按「最后一个 calling」匹配即天然防倒灌）
    for (let i = calls.length - 1; i >= 0; i--) {
      if (calls[i].tool === record.tool && calls[i].status === 'calling') {
        calls[i] = { ...calls[i], ...record, status: 'done' }
        updateMessageMetadata(msg.id, { toolCalls: calls })
        return true
      }
    }
    // 没有匹配的 calling（断线重放丢了 calling）：作为完成项直接落
    calls.push({ ...record, status: 'done' })
  } else {
    calls.push(record)
  }
  updateMessageMetadata(msg.id, { toolCalls: calls })
  return true
}

export function handleToolCalling(event: ToolCallingEvent, context: HandlerContext): void {
  const { debug } = context
  const ok = appendToolCall(context, event.data.task_id, {
    tool: event.data.tool,
    source: event.data.source,
    status: 'calling',
  })
  if (debug && ok) {
    logger.debug('[ToolEvents] tool.calling:', event.data.tool, 'attempt', event.data.attempt)
  }
}

export function handleToolResult(event: ToolResultEvent, context: HandlerContext): void {
  const { debug } = context
  const ok = appendToolCall(context, event.data.task_id, {
    tool: event.data.tool,
    source: event.data.source,
    duration_ms: event.data.duration_ms,
    success: event.data.success,
    status: 'done',
  })
  if (debug && ok) {
    logger.debug('[ToolEvents] tool.result:', event.data.tool, event.data.success)
  }
}
