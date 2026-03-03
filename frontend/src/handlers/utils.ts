/**
 * Event Handlers 共享工具函数
 */

import type { useChatStore } from '@/store/chatStore'
import type { LastAssistantMessageResult } from './types'
import { findMessageById } from '@/utils/normalize'

/**
 * 🔥 性能优化：获取最后一条助手消息
 * 优先使用缓存的 lastAssistantMessageId，避免遍历整个消息数组
 */
export function getLastAssistantMessage(
  chatStore: ReturnType<typeof useChatStore.getState>
): LastAssistantMessageResult | null {
  const { lastAssistantMessageId, messages } = chatStore

  // 优先使用缓存 ID
  if (lastAssistantMessageId) {
    // 🔥 使用规范化工具查找
    const msg = findMessageById(messages, lastAssistantMessageId)
    if (msg) {
      return { message: msg, id: lastAssistantMessageId }
    }
  }

  // 降级：遍历查找（兼容旧数据）
  const lastAiMessage = [...messages].reverse().find((m) => m.role === 'assistant')
  if (lastAiMessage?.id) {
    return { message: lastAiMessage, id: lastAiMessage.id }
  }

  return null
}
