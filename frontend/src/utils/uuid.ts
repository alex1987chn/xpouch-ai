/**
 * UUID 生成工具
 * 使用浏览器原生 crypto.randomUUID()，无需额外依赖
 * 
 * 浏览器兼容性：Chrome 92+, Firefox 95+, Safari 15.4+, Edge 92+
 * 详见：https://caniuse.com/mdn-api_crypto_randomuuid
 */

/**
 * 生成标准 UUID v4
 * 用于消息ID、会话ID等需要全局唯一的场景
 */
export function generateUUID(): string {
  return crypto.randomUUID()
}

/**
 * 生成短ID（8位随机字符）
 * 用于临时标识、本地缓存key等场景
 */
export function generateShortId(): string {
  return Math.random().toString(36).substring(2, 10)
}
