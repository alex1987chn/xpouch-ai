// 配置工具函数
// 提供便捷的配置访问方法

import { defaultModel, models as modelConfigs, agentDefaultModels } from '@/config/models'
import { getAgentDefaultPrompt } from '@/data/agents'

// 导出可用模型列表（兼容旧代码）
export const AVAILABLE_MODELS = modelConfigs.map(m => ({
  id: m.id,
  name: m.name,
  description: `${m.provider} - ${m.contextWindow} tokens`,
  provider: m.provider
}))

export { getAgentDefaultPrompt, defaultModel, agentDefaultModels }

// 类型定义
export interface AgentPromptConfig {
  agentId: string
  prompt: string
  enabled: boolean
}

export interface AppConfig {
  defaultModelId: string
  agentPrompts: Record<string, AgentPromptConfig>
  apiKeys: {
    openai?: string
    anthropic?: string
    deepseek?: string
  }
}

// LocalStorage 键名
const CONFIG_STORAGE_KEY = 'xpouch-app-config'

/**
 * 获取默认模型 ID
 * @returns 默认模型的 ID
 */
export function getDefaultModel(): string {
  const config = loadConfig()
  return config.defaultModelId || defaultModel
}

/**
 * 设置默认模型 ID
 * @param modelId 模型 ID
 */
export function setDefaultModel(modelId: string): void {
  const config = loadConfig()
  config.defaultModelId = modelId
  saveConfig(config)
}

/**
 * 获取智能体的 Prompt 配置
 * @param agentId 智能体 ID
 * @returns Prompt 配置
 */
export function getAgentPrompt(agentId: string): AgentPromptConfig | undefined {
  const config = loadConfig()
  return config.agentPrompts[agentId]
}

/**
 * 设置智能体的 Prompt 配置
 * @param agentId 智能体 ID
 * @param prompt Prompt 内容
 */
export function setAgentPrompt(agentId: string, prompt: string): void {
  const config = loadConfig()
  config.agentPrompts[agentId] = {
    agentId,
    prompt,
    enabled: prompt.trim().length > 0
  }
  saveConfig(config)
}

/**
 * 从 LocalStorage 加载配置
 * @returns 应用配置
 */
function loadConfig(): AppConfig {
  try {
    const stored = localStorage.getItem(CONFIG_STORAGE_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (error) {
    logger.error('Failed to load config:', error)
  }
  return {
    defaultModelId: defaultModel,
    agentPrompts: {},
    apiKeys: {}
  }
}

/**
 * 保存配置到 LocalStorage
 * @param config 应用配置
 */
function saveConfig(config: AppConfig): void {
  try {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config))
  } catch (error) {
    logger.error('Failed to save config:', error)
  }
}

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
