// 统一模型配置 - 集中管理所有渠道的模型配置
// ⚠️ 安全提醒：所有 API Key 只能从环境变量读取，严禁前端 localStorage 存储

import type { Provider } from '@/types/model-provider'

// 从环境变量加载配置（Vite 环境变量）
// ⚠️ 前端无法直接访问后端环境变量，API Key 需通过后端代理获取
const getEnv = (key: string): string => {
  return import.meta.env[key] || ''
}

// 渠道配置 - API Key 从环境变量读取
export const providerConfigs: Record<Provider, {
  name: string
  apiKey: string
  baseURL: string
}> = {
  deepseek: {
    name: 'DeepSeek',
    apiKey: getEnv('DEEPSEEK_API_KEY'),
    baseURL: 'https://api.deepseek.com/v1'
  },
  openai: {
    name: 'OpenAI',
    apiKey: getEnv('OPENAI_API_KEY'),
    baseURL: 'https://api.openai.com/v1'
  },
  anthropic: {
    name: 'Anthropic',
    apiKey: getEnv('ANTHROPIC_API_KEY'),
    baseURL: 'https://api.anthropic.com/v1'
  },
  google: {
    name: 'Google',
    apiKey: getEnv('GOOGLE_API_KEY'),
    baseURL: 'https://generativelanguage.googleapis.com/v1'
  }
}

// 模型列表 - 包含所有支持的模型
export const models = [
  // DeepSeek
  { id: 'deepseek-chat', name: 'DeepSeek Chat', provider: 'deepseek', model: 'deepseek-chat', contextWindow: 128000 },
  { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', provider: 'deepseek', model: 'deepseek-reasoner', contextWindow: 128000 },

  // OpenAI
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', model: 'gpt-4o', contextWindow: 128000 },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', model: 'gpt-4o-mini', contextWindow: 128000 },
  { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'openai', model: 'gpt-4-turbo', contextWindow: 128000 },
  { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: 'openai', model: 'gpt-3.5-turbo', contextWindow: 16000 },

  // Anthropic
  { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'anthropic', model: 'claude-sonnet-4-20250514', contextWindow: 200000 },
  { id: 'claude-haiku-3-20250514', name: 'Claude Haiku 3', provider: 'anthropic', model: 'claude-haiku-3-20250514', contextWindow: 200000 },

  // Google
  { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash', provider: 'google', model: 'gemini-2.0-flash-exp', contextWindow: 1048576 },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'google', model: 'gemini-1.5-pro', contextWindow: 2000000 },
  { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', provider: 'google', model: 'gemini-1.5-flash', contextWindow: 1000000 }
] as const

// 智能体默认模型映射
export const agentDefaultModels: Record<string, string> = {
  assistant: 'deepseek-chat',      // 通用助手默认用 DeepSeek
  coder: 'gpt-4o',                 // 代码专家用 GPT-4o
  designer: 'gpt-4o',              // 设计师用 GPT-4o
  video: 'deepseek-chat',          // 视频大师用 DeepSeek
  musician: 'deepseek-chat',       // 音乐家用 DeepSeek
  analyst: 'gpt-4o',               // 数据分析师用 GPT-4o
  researcher: 'claude-sonnet-4-20250514', // 研究员用 Claude
  creator: 'gpt-4o'                // 创意总监用 GPT-4o
}

// 便捷函数：获取模型配置（包含 API Key 和 BaseURL）
export function getModelConfig(modelId: string) {
  const model = models.find(m => m.id === modelId)
  if (!model) return null

  const provider = providerConfigs[model.provider as Provider]
  return {
    ...model,
    ...provider
  }
}

// 便捷函数：获取智能体使用的模型配置
export function getAgentModel(agentId: string) {
  const modelId = agentDefaultModels[agentId] || 'deepseek-chat'
  return getModelConfig(modelId)
}

// 默认模型（首页对话默认使用）
export const defaultModel = 'deepseek-chat'

// 便捷函数：验证 API Key 是否配置
export function isProviderConfigured(provider: Provider): boolean {
  return !!providerConfigs[provider].apiKey
}

// 便捷函数：获取已配置的提供商
export function getConfiguredProviders(): Provider[] {
  return (Object.keys(providerConfigs) as Provider[]).filter(provider => 
    isProviderConfigured(provider)
  )
}
