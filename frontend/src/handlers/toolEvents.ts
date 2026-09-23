/**
 * Tool 相关事件处理器
 *
 * 处理的事件类型：
 * - tool.calling: 单个 tool_call 开始（attempt 标注重试轮次）
 * - tool.result: 单个 tool_call 结束（耗时/成败）
 *
 * 数据落点：最后一条 AI 消息的 thinking 数组里对应 task_id 的步骤——
 * toolActivity 记「当前活动」（调用中/刚完成，仅执行期间渲染），
 * toolHistory 记终态明细（append-only，任务完成后保留为汇总行与展开明细，
 * 对齐主流 agent 产品的做法：工具痕迹是结果可信度的证据）。
 */

import type { ToolCallingEvent, ToolResultEvent } from './types'
import type { HandlerContext } from './types'
import { getLastAssistantMessage } from './utils'
import { logger } from '@/utils/logger'
import type { ThinkingStep } from '@/types'

export function handleToolCalling(event: ToolCallingEvent, context: HandlerContext): void {
  const { chatStore, debug } = context
  const { updateMessageMetadata } = chatStore

  const lastAi = getLastAssistantMessage(chatStore)
  if (!lastAi?.message.metadata?.thinking) return

  const thinking = [...lastAi.message.metadata.thinking]
  const idx = thinking.findIndex((s: ThinkingStep) => s.id === event.data.task_id)
  if (idx < 0) return

  thinking[idx] = {
    ...thinking[idx],
    toolActivity: {
      tool: event.data.tool,
      source: event.data.source,
      state: 'calling',
      attempt: event.data.attempt,
    },
  }
  updateMessageMetadata(lastAi.id, { thinking })

  if (debug) {
    logger.debug('[ToolEvents] tool.calling:', event.data.tool, 'attempt', event.data.attempt)
  }
}

export function handleToolResult(event: ToolResultEvent, context: HandlerContext): void {
  const { chatStore, debug } = context
  const { updateMessageMetadata } = chatStore

  const lastAi = getLastAssistantMessage(chatStore)
  if (!lastAi?.message.metadata?.thinking) return

  const thinking = [...lastAi.message.metadata.thinking]
  const idx = thinking.findIndex((s: ThinkingStep) => s.id === event.data.task_id)
  if (idx < 0) return

  // 仅当 result 对应的仍是「当前显示的工具」时才覆盖 calling 态：
  // 并发任务各自更新自己的步骤，这里防的是同一任务内乱序到达的旧结果
  // （重试序列中 attempt=1 的迟到 result 覆盖 attempt=2 的 calling）。
  const current = thinking[idx].toolActivity
  if (current && current.tool !== event.data.tool) return

  // 终态明细 append 到 toolHistory（重试只记最终一次，与账本口径一致）
  const toolHistory = [
    ...(thinking[idx].toolHistory ?? []),
    {
      tool: event.data.tool,
      source: event.data.source,
      durationMs: event.data.duration_ms,
      success: event.data.success,
    },
  ]

  thinking[idx] = {
    ...thinking[idx],
    toolActivity: {
      tool: event.data.tool,
      source: event.data.source,
      state: 'done',
      durationMs: event.data.duration_ms,
      success: event.data.success,
    },
    toolHistory,
  }
  updateMessageMetadata(lastAi.id, { thinking })

  if (debug) {
    logger.debug('[ToolEvents] tool.result:', event.data.tool, event.data.success)
  }
}
