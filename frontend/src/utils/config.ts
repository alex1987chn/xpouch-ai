// 配置工具函数
// 提供便捷的环境配置访问方法
//
// 说明：
// - 模型列表与用户模型偏好已迁移至后端（GET /api/models、GET/PUT /api/user/settings）
// - 旧的 localStorage 默认模型配置（xpouch-app-config.defaultModelId）已废弃，静默忽略

/**
 * 获取当前应用的 API URL
 * @returns API 基础 URL
 */
export function getApiUrl(): string {
  return import.meta.env.VITE_API_URL || '/api'
}

/**
 * 获取 API 超时时间
 * @returns 超时时间（毫秒）
 */
export function getApiTimeout(): number {
  return parseInt(import.meta.env.VITE_API_TIMEOUT || '30000', 10)
}

/**
 * 是否启用打字效果
 * @returns 是否启用
 */
export function isTypingEffectEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_TYPING_EFFECT !== 'false'
}

/**
 * 是否启用音效
 * @returns 是否启用
 */
export function isSoundEffectsEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_SOUND_EFFECTS === 'true'
}

/**
 * 获取当前应用环境
 * @returns 环境名称（development, production 等）
 */
export function getAppEnvironment(): string {
  return import.meta.env.VITE_APP_ENV || 'development'
}

/**
 * 判断是否为开发环境
 * @returns 是否为开发环境
 */
export function isDevelopment(): boolean {
  return getAppEnvironment() === 'development'
}

/**
 * 判断是否为生产环境
 * @returns 是否为生产环境
 */
export function isProduction(): boolean {
  return getAppEnvironment() === 'production'
}
