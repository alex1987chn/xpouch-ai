/**
 * 数据规范化工具
 * 在 API 边界层统一处理后端返回的数据格式问题
 * 
 * 核心理念：防腐层 (Anti-Corruption Layer)
 * - 后端数据格式问题在入口处解决
 * - 业务组件只处理规范化的数据
 */

import type { Message } from '@/types'

/**
 * 规范化消息 ID
 * 后端可能返回 number 或 string，统一转换为 string
 */
export function normalizeId(id: string | number | undefined): string {
  if (id === undefined || id === null) {
    return ''
  }
  return String(id)
}

/**
 * 规范化消息对象
 * 确保所有 ID 字段都是 string 类型
 */
export function normalizeMessage(message: Partial<Message> & { id?: string | number }): Message {
  return {
    ...message,
    id: normalizeId(message.id),
    // 确保其他可能存在的 ID 字段也被规范化
    thread_id: 'thread_id' in message ? normalizeId(message.thread_id as string | number) : undefined,
  } as Message
}

/**
 * 规范化消息数组
 * 用于批量处理后端返回的消息列表
 */
export function normalizeMessages(messages: Array<Partial<Message> & { id?: string | number }>): Message[] {
  return messages.map(normalizeMessage)
}

/**
 * 类型守卫：检查两个 ID 是否相等
 * 统一使用 string 比较，避免 number === string 的问题
 */
export function isSameId(a: string | number | undefined, b: string | number | undefined): boolean {
  return normalizeId(a) === normalizeId(b)
}

/**
 * 在数组中查找指定 ID 的消息
 * 使用规范化的 ID 比较
 */
export function findMessageById<T extends { id?: string | number }>(
  messages: T[],
  id: string | number
): T | undefined {
  const normalizedTarget = normalizeId(id)
  return messages.find(m => normalizeId(m.id) === normalizedTarget)
}

/**
 * 在数组中查找指定 ID 的消息索引
 */
export function findMessageIndexById<T extends { id?: string | number }>(
  messages: T[],
  id: string | number
): number {
  const normalizedTarget = normalizeId(id)
  return messages.findIndex(m => normalizeId(m.id) === normalizedTarget)
}
