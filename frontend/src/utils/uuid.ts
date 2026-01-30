/**
 * UUID 生成工具
 * 统一使用 uuid 库，兼容 crypto.randomUUID()
 */

import { v4 as uuidv4 } from 'uuid'

/**
 * 生成 UUID v4
 */
export function generateUUID(): string {
  // 优先使用 uuid 库
  if (typeof uuidv4 === 'function') {
    return uuidv4()
  }
  // 回退到 crypto.randomUUID()
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // 最后回退到手动生成
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0
    const v = c == 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

/**
 * 短 ID 生成（用于本地缓存等场景）
 */
export function generateShortId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9)
}
