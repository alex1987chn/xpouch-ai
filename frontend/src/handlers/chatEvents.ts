/**
 * Chat/Message 相关事件处理器
 *
 * 处理的事件类型：
 * - message.delta: 流式更新消息内容
 * - message.thinking: 流式更新模型思考过程（reasoning_content）
 * - message.done: 完成消息流式输出
 */

import type { MessageDeltaEvent, MessageDoneEvent, MessageThinkingEvent } from './types'
import type { HandlerContext } from './types'
import { logger } from '@/utils/logger'
import { findMessageById } from '@/utils/normalize'
import { useChatStore } from '@/store/chatStore'
import { t } from '@/i18n'
import type { ThinkingStep } from '@/types'

// 🔥 防重：已处理过的 message.done 消息ID集合。
// 上限保护（评审低危项）：长生命周期页面下集合只增不减，超限即整体清空——
// 清空的代价只是极端旧消息的 done 被重复处理一次（幂等），远好于无界增长。
const PROCESSED_DONES_CAP = 500
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
  const { addMessage, messages } = chatStore

  // 查找消息（前端应该在 useChatCore 中已经创建空消息）
  // 🔥 使用规范化工具查找
  const message = findMessageById(messages, event.data.message_id)

  if (!message) {
    // v3.1: 如果找不到消息（复杂模式的聚合消息 = 服务端自造 id），自动创建。
    // content 置空：正文写入由 useChatCore 的 RAF 批处理层负责（makeStreamCallback
    // 对同一事件先建消息再 retarget），此处写入首帧会造成同帧内容双写
    if (debug)
      logger.debug(
        '[ChatEvents] message.delta: 消息不存在，自动创建:',
        event.data.message_id
      )

    // 创建新消息
    addMessage({
      id: event.data.message_id,
      role: 'assistant',
      content: '',
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
 * 处理 message.thinking 事件
 * 流式累积模型思考过程（DeepSeek reasoning_content）
 *
 * 以单一 ThinkingStep（id=model_reasoning）挂在消息 metadata.thinking 上，
 * 复用 ThinkingProcess 组件渲染；message.done 时既有逻辑会将其标记为 completed。
 */
export function handleMessageThinking(
  event: MessageThinkingEvent,
  context: HandlerContext
): void {
  const { chatStore, debug } = context
  const { addMessage, updateMessageMetadata, messages } = chatStore

  let message = findMessageById(messages, event.data.message_id)
  if (!message) {
    // 与 message.delta 相同的兜底：消息尚未创建时自动创建空消息
    if (debug)
      logger.debug(
        '[ChatEvents] message.thinking: 消息不存在，自动创建:',
        event.data.message_id
      )
    addMessage({
      id: event.data.message_id,
      role: 'assistant',
      content: '',
      timestamp: Date.now()
    })
    message = findMessageById(useChatStore.getState().messages, event.data.message_id)
  }
  if (!message) return

  const thinking = [...(message.metadata?.thinking ?? [])]
  const stepIndex = thinking.findIndex((s) => s.id === 'model_reasoning')
  if (stepIndex >= 0) {
    thinking[stepIndex] = {
      ...thinking[stepIndex],
      content: thinking[stepIndex].content + event.data.content
    }
  } else {
    thinking.push({
      id: 'model_reasoning',
      expertType: 'analysis',
      expertName: t('thinkingReasoning'),
      content: event.data.content,
      timestamp: new Date().toISOString(),
      status: 'running',
      type: 'analysis'
    })
  }
  updateMessageMetadata(event.data.message_id, { thinking })

  if (debug) {
    logger.debug(
      '[ChatEvents] message.thinking 累积:',
      event.data.content.substring(0, 30) + '...'
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
  if (processedMessageDones.size >= PROCESSED_DONES_CAP) {
    processedMessageDones.clear()
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

  // （占位消息思考步骤迁移逻辑已退役：复杂模式的思考载体消息由 commander
  // 落库、plan.created 事件把占位原位改写成它——刷新后步骤由账本重建挂回
  // 同一条，不再需要 done 时把步骤从占位搬到正文消息）

  // 🔥 最终校准：用后端返回的完整内容覆盖前端累积内容
  // 这可以纠正流式传输中可能的数据丢失或乱序问题
  updateMessage(event.data.message_id, event.data.full_content, false)

  // 说明：这里原本有一段「把后端 message.done 里的 thinking.steps 合并进前端累积步骤」。
  // 现已删除 —— 后端**从不发送**结构化步骤（发射器从不构造 `thinking=`；协议里
  // `thinking` 是留给前端扩展的松字段），那段分支永远走不到。步骤的权威来源是流式
  // 期间的事件（handlers/taskEvents 等）与恢复时的账本重建
  // （lib/thinkingStepsFromTimeline）。

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
      finalMessage?.metadata?.thinking?.length ?? 0
    )
  }
  const finalThinking = finalMessage?.metadata?.thinking ?? []
  if (finalThinking.length > 0) {
    const hasRunningSteps = finalThinking.some(
      (s: ThinkingStep) => s.status === 'running'
    )
    if (debug) {
      logger.debug('[ChatEvents] message.done: hasRunningSteps=', hasRunningSteps)
    }
    if (hasRunningSteps) {
      const completedThinking = finalThinking.map((s: ThinkingStep) => ({
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
