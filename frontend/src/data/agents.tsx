import {
  MessageSquare,
  Code,
  Search,
  FileText,
  PenTool,
  Layout,
  Image as ImageIcon
} from 'lucide-react'
import type { Agent } from '@/types'

// 获取默认智能体（首页使用）
export function getDefaultAgent(): Agent | undefined {
  return experts.find(agent => agent.isDefault)
}

// 获取智能体的默认prompt模板
export function getAgentDefaultPrompt(agentId: string): string {
  const prompts: Record<string, string> = {
    assistant: '你是一个通用AI助手，能够帮助用户处理各种任务，包括问答、写作、翻译等。请用友好、专业的语气回答。',
    search: '你是一个信息搜索专家，擅长搜索、查询和分析信息。请提供准确、可靠的搜索结果。',
    coder: '你是一个资深代码专家，擅长代码生成、调试、重构和代码审查。请提供高质量、可维护的代码解决方案。',
    researcher: '你是一个研究专家，擅长深入研究、文献调研和知识问答。请提供全面、准确的研究结果。',
    analyzer: '你是一个分析专家，擅长逻辑分析、数据推理和问题诊断。请提供深入、有洞察力的分析报告。',
    writer: '你是一个写作专家，擅长文案创作、内容撰写和文档整理。请提供清晰、生动、易于理解的内容。',
    planner: '你是一个规划专家，擅长任务拆解、方案设计和流程规划。请提供详细、可执行的计划方案。',
    image_analyzer: '你是一个图片分析专家，擅长识别和分析图片内容、视觉元素和场景。请提供准确、详细的图片描述和分析。'
  }
  return prompts[agentId] || prompts['assistant']
}

// 专家池 - 首页精选智能体（来自后端双模路由的专家类型）
export const experts: Agent[] = [
  {
    id: 'search',
    name: '搜索专家',
    description: '信息搜索、查询分析、结果整理',
    icon: <Search className="h-5 w-5" />,
    color: 'from-blue-500 to-cyan-500',
    category: '信息',
    modelId: 'deepseek-chat',
    isDefault: true, // 标记为首页默认智能体
    is_builtin: true
  },
  {
    id: 'coder',
    name: '编程专家',
    description: '代码编写、调试优化、代码审查',
    icon: <Code className="h-5 w-5" />,
    color: 'from-green-500 to-emerald-500',
    category: '开发',
    modelId: 'deepseek-chat',
    is_builtin: true
  },
  {
    id: 'researcher',
    name: '研究专家',
    description: '深度调研、文献分析、知识问答',
    icon: <FileText className="h-5 w-5" />,
    color: 'from-purple-500 to-violet-500',
    category: '研究',
    modelId: 'deepseek-chat',
    is_builtin: true
  },
  {
    id: 'analyzer',
    name: '分析专家',
    description: '逻辑推理、数据分析、问题诊断',
    icon: <Layout className="h-5 w-5" />,
    color: 'from-rose-500 to-pink-500',
    category: '分析',
    modelId: 'deepseek-chat',
    is_builtin: true
  },
  {
    id: 'writer',
    name: '写作专家',
    description: '文案创作、内容撰写、文档整理',
    icon: <PenTool className="h-5 w-5" />,
    color: 'from-amber-500 to-orange-500',
    category: '创作',
    modelId: 'deepseek-chat',
    is_builtin: true
  },
  {
    id: 'planner',
    name: '规划专家',
    description: '任务拆解、方案设计、流程规划',
    icon: <MessageSquare className="h-5 w-5" />,
    color: 'from-indigo-500 to-blue-500',
    category: '规划',
    modelId: 'deepseek-chat',
    is_builtin: true
  },
  {
    id: 'image_analyzer',
    name: '图片分析专家',
    description: '图片识别、内容分析、视觉解读',
    icon: <ImageIcon className="h-5 w-5" />,
    color: 'from-teal-500 to-cyan-500',
    category: '视觉',
    modelId: 'deepseek-chat',
    is_builtin: true
  }
]

// 保留原有的 agents 数组以供兼容
export const agents: Agent[] = experts
