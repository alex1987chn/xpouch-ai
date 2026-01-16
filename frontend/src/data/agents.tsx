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

export interface Agent {
  id: string
  name: string
  description: string
  icon: React.ReactNode
  color: string
  category: string
  modelId: string // 指定使用的模型ID
  promptTemplate?: string // 可选：自定义 prompt 模板
  isDefault?: boolean // 是否为首页默认智能体
}

// 获取默认智能体（首页使用）
export function getDefaultAgent(): Agent | undefined {
  return agents.find(agent => agent.isDefault)
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
