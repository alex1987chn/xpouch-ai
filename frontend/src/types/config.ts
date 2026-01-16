export interface ModelConfig {
  id: string
  name: string
  description: string
  provider: string // 模型提供商：openai, anthropic, etc.
}

export interface AgentPromptConfig {
  agentId: string
  prompt: string // 自定义 prompt
  enabled: boolean // 是否启用自定义 prompt
}

export interface AppConfig {
  defaultModelId: string // 默认使用的模型ID
  agentPrompts: Record<string, AgentPromptConfig> // 智能体 prompt 配置
  apiKeys: {
    openai?: string // OpenAI API Key
    anthropic?: string // Anthropic API Key
    deepseek?: string // DeepSeek API Key
  } // API Key 配置
}

export const AVAILABLE_MODELS: ModelConfig[] = [
  {
    id: 'deepseek-chat',
    name: 'DeepSeek Chat',
    description: 'DeepSeek 高性能对话模型',
    provider: 'deepseek'
  },
  {
    id: 'deepseek-coder',
    name: 'DeepSeek Coder',
    description: 'DeepSeek 专业代码模型',
    provider: 'deepseek'
  },
  {
    id: 'gpt-4',
    name: 'GPT-4',
    description: 'OpenAI 最先进的大型语言模型',
    provider: 'openai'
  },
  {
    id: 'gpt-4-turbo',
    name: 'GPT-4 Turbo',
    description: 'OpenAI 高速推理模型',
    provider: 'openai'
  },
  {
    id: 'gpt-3.5-turbo',
    name: 'GPT-3.5 Turbo',
    description: 'OpenAI 经济实惠的高性能模型',
    provider: 'openai'
  },
  {
    id: 'claude-3-opus',
    name: 'Claude 3 Opus',
    description: 'Anthropic 最强大的 AI 模型',
    provider: 'anthropic'
  },
  {
    id: 'claude-3-sonnet',
    name: 'Claude 3 Sonnet',
    description: 'Anthropic 高性价比的智能模型',
    provider: 'anthropic'
  }
]

// 默认配置
export const DEFAULT_CONFIG: AppConfig = {
  defaultModelId: 'deepseek-chat',
  agentPrompts: {},
  apiKeys: {}
}

// 获取默认 prompt 模板（如果智能体没有配置自定义 prompt）
export const getAgentDefaultPrompt = (agentId: string): string => {
  const prompts: Record<string, string> = {
    assistant: '你是一个通用AI助手，能够帮助用户处理各种任务，包括问答、写作、翻译等。请用友好、专业的语气回答。',
    coder: '你是一个资深代码专家，擅长代码生成、调试、重构和代码审查。请提供高质量、可维护的代码解决方案。',
    designer: '你是一个专业设计师，擅长图像生成、设计建议和视觉创作。请提供创意且实用的设计方案。',
    video: '你是一个视频大师，精通视频生成、剪辑和特效制作。请提供专业的视频制作建议。',
    musician: '你是一个音乐家，擅长音乐创作、音频处理和声音设计。请提供专业的音乐制作建议。',
    analyst: '你是一个数据分析师，精通数据分析、报告生成和可视化。请提供深入的数据洞察。',
    researcher: '你是一个研究员，擅长深度研究、文献分析和知识问答。请提供全面、准确的研究结果。',
    creator: '你是一个创意总监，擅长创意策划、内容生成和品牌策略。请提供创新的创意方案。'
  }
  return prompts[agentId] || prompts['assistant']
}
