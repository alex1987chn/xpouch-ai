import {
  MessageSquare,
  Code,
  Image as ImageIcon,
  Video,
  Music,
  BarChart3,
  Brain,
  Wand
} from 'lucide-react'
import type { Agent } from '@/types'

// 获取默认智能体（首页使用）
export function getDefaultAgent(): Agent | undefined {
  return agents.find(agent => agent.isDefault)
}

// 获取智能体的默认prompt模板
export function getAgentDefaultPrompt(agentId: string): string {
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

export const agents: Agent[] = [
  {
    id: 'assistant',
    name: '通用助手',
    description: '智能问答、写作、翻译等综合能力',
    icon: <MessageSquare className="h-5 w-5" />,
    color: 'from-blue-500 to-purple-500',
    category: '综合',
    modelId: 'deepseek-chat', // 默认使用 DeepSeek
    isDefault: true // 标记为首页默认智能体
  },
  {
    id: 'coder',
    name: '代码专家',
    description: '代码生成、调试、重构、代码审查',
    icon: <Code className="h-5 w-5" />,
    color: 'from-green-500 to-emerald-500',
    category: '开发',
    modelId: 'gpt-4o'
  },
  {
    id: 'designer',
    name: '设计师',
    description: '图像生成、设计建议、视觉创作',
    icon: <ImageIcon className="h-5 w-5" />,
    color: 'from-pink-500 to-rose-500',
    category: '创作',
    modelId: 'gpt-4o'
  },
  {
    id: 'video',
    name: '视频大师',
    description: '视频生成、剪辑、特效制作',
    icon: <Video className="h-5 w-5" />,
    color: 'from-orange-500 to-red-500',
    category: '创作',
    modelId: 'deepseek-chat'
  },
  {
    id: 'musician',
    name: '音乐家',
    description: '音乐创作、音频处理、声音设计',
    icon: <Music className="h-5 w-5" />,
    color: 'from-yellow-500 to-orange-500',
    category: '创作',
    modelId: 'deepseek-chat'
  },
  {
    id: 'analyst',
    name: '数据分析师',
    description: '数据分析、报告生成、可视化',
    icon: <BarChart3 className="h-5 w-5" />,
    color: 'from-cyan-500 to-blue-500',
    category: '分析',
    modelId: 'gpt-4o'
  },
  {
    id: 'researcher',
    name: '研究员',
    description: '深度研究、文献分析、知识问答',
    icon: <Brain className="h-5 w-5" />,
    color: 'from-indigo-500 to-purple-500',
    category: '研究',
    modelId: 'claude-sonnet-4-20250514'
  },
  {
    id: 'creator',
    name: '创意总监',
    description: '创意策划、内容生成、品牌策略',
    icon: <Wand className="h-5 w-5" />,
    color: 'from-violet-500 to-fuchsia-500',
    category: '创作',
    modelId: 'gpt-4o'
  }
]
