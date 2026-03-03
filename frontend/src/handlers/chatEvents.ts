/**
 * Chat/Message 相关事件处理器
 * 
 * 处理的事件类型：
 * - message.delta: 流式更新消息内容
 * - message.done: 完成消息流式输出
 */

import type { MessageDeltaEvent, MessageDoneEvent } from './types'
import type { HandlerContext } from './types'
import { logger } from '@/utils/logger'
import { findMessageById } from '@/utils/normalize'
import { useChatStore } from '@/store/chatStore'

// 🔥 防重：已处理过的 message.done 消息ID集合
const processedMessageDones = new Set<string>()

/**
 * 清空已处理的消息完成记录
 * 用于测试或重置状态
 */
export function clearProcessedMessageDones(): void {
  processedMessageDones.clear()
}

/**
 * 清除特定消息 ID 的去重记录
 * 用于重新生成消息时允许再次处理相同 ID
 */
export function clearProcessedMessageDone(messageId: string): void {
  processedMessageDones.delete(messageId)
}

/**
 * 处理 message.delta 事件
 * 流式更新消息内容
 * 
 * 🔥 注意：实际更新已由 useChatCore.ts 中的 streamCallback 处理
 * 这里不再重复更新，避免内容双倍追加
 */
export function handleMessageDelta(
  event: MessageDeltaEvent,
  context: HandlerContext
): void {
  const { chatStore, debug } = context
  const { updateMessage, addMessage, messages } = chatStore

  // 查找消息（前端应该在 useChatCore 中已经创建空消息）
  // 🔥 使用规范化工具查找
  const message = findMessageById(messages, event.data.message_id)

  if (!message) {
    // v3.1: 如果找不到消息（例如复杂模式下 aggregator 延迟），自动创建消息
    if (debug)
      logger.debug(
        '[ChatEvents] message.delta: 消息不存在，自动创建:',
        event.data.message_id
      )

    // 创建新消息
    addMessage({
      id: event.data.message_id,
      role: 'assistant',
      content: event.data.content,
      timestamp: Date.now()
    })
    return
  }

  // 🔥 修复：避免重复更新
  // message.delta 的更新已由 useChatCore.ts 中的 streamCallback 处理
  // 这里不再重复更新，避免内容双倍追加

  if (debug) {
    logger.debug(
      '[ChatEvents] message.delta: 跳过更新（已由 useChatCore 处理）',
      event.data.message_id
    )
  }
}

/**
 * 处理 message.done 事件
 * 完成消息流式输出
 */
export function handleMessageDone(
  event: MessageDoneEvent,
  context: HandlerContext
): void {
  const { chatStore, debug } = context
  const { updateMessage, updateMessageMetadata, messages } = chatStore

  // 🔥🔥🔥 防重保护：如果已处理过，直接忽略
  if (processedMessageDones.has(event.data.message_id)) {
    logger.debug(
      '[ChatEvents] message.done: 已处理过，忽略重复事件:',
      event.data.message_id
    )
    return
  }
  processedMessageDones.add(event.data.message_id)

  // 查找消息
  // 🔥 使用规范化工具查找
  const message = findMessageById(messages, event.data.message_id)

  if (debug) {
    logger.debug(
      '[ChatEvents] message.done: 消息ID=',
      event.data.message_id,
      '找到消息=',
      !!message,
      '内容长度=',
      event.data.full_content?.length
    )
  }

  if (!message) {
    logger.warn('[ChatEvents] message.done: 找不到消息:', event.data.message_id)
    return
  }

  // 🔥 最终校准：用后端返回的完整内容覆盖前端累积内容
  // 这可以纠正流式传输中可能的数据丢失或乱序问题
  updateMessage(event.data.message_id, event.data.full_content, false)

  // 🔥 修复：合并 thinking 数据，而不是覆盖
  // 优先使用前端累积的 thinking，后端返回的作为补充
  if (event.data.thinking?.steps?.length > 0) {
    const existingThinking = message.metadata?.thinking || []
    const newSteps = event.data.thinking.steps

    // 合并：保留现有步骤，添加后端返回的新步骤（去重）
    const existingIds = new Set(existingThinking.map((s: any) => s.id))
    const mergedThinking = [
      ...existingThinking,
      ...newSteps.filter((s: any) => !existingIds.has(s.id))
    ]

    updateMessageMetadata(event.data.message_id, {
      thinking: mergedThinking
    })

    if (debug) {
      logger.debug(
        '[ChatEvents] 合并 thinking 数据，前端:',
        existingThinking.length,
        '后端:',
        newSteps.length,
        '合并后:',
        mergedThinking.length
      )
    }
  }

  // 🔥🔥🔥 关键修复：message.done 时将所有 thinking steps 标记为 completed
  // 防止流结束后仍有 running 状态的步骤导致 UI 一直转圈
  // 🔥 修复：从 store 获取最新消息，而不是使用传入的快照
  const latestMessages = useChatStore.getState().messages
  const finalMessage = findMessageById(latestMessages, event.data.message_id)
  if (debug) {
    logger.debug(
      '[ChatEvents] message.done: finalMessage=',
      !!finalMessage,
      'thinking=',
      finalMessage?.metadata?.thinking?.length
    )
  }
  if (finalMessage?.metadata?.thinking?.length > 0) {
    const hasRunningSteps = finalMessage.metadata.thinking.some(
      (s: any) => s.status === 'running'
    )
    if (debug) {
      logger.debug('[ChatEvents] message.done: hasRunningSteps=', hasRunningSteps)
    }
    if (hasRunningSteps) {
      const completedThinking = finalMessage.metadata.thinking.map((s: any) => ({
        ...s,
        status: 'completed' as const
      }))
      updateMessageMetadata(event.data.message_id, { thinking: completedThinking })
      if (debug) {
        logger.debug('[ChatEvents] message.done: 已将所有 thinking steps 标记为 completed')
      }
    }
  }

  if (debug) {
    logger.debug('[ChatEvents] 消息完成:', event.data.message_id)
  }
}
