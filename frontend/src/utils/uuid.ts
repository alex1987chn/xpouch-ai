/**
 * UUID 生成工具
 * 统一使用 uuid 库 v4
 */
import { v4 as uuidv4 } from 'uuid'

/**
 * 生成标准 UUID v4
 * 用于消息ID、会话ID等需要全局唯一的场景
 */
export function generateUUID(): string {
  return uuidv4()
}

/**
 * 生成短ID（8位随机字符）
 * 用于临时标识、本地缓存key等场景
 */
export function generateShortId(): string {
  return Math.random().toString(36).substring(2, 10)
}
