// 模型提供商类型定义

export type Provider = 'deepseek' | 'openai' | 'anthropic' | 'google' | 'minimax'

export interface ModelInfo {
  id: string
  name: string
  provider: Provider
  model: string
  contextWindow: number
}
