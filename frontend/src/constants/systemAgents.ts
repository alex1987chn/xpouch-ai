/**
 * 系统智能体注册表
 * 这是 LangGraph 专家智能体的单一数据源
 * 这些是系统内置的，由开发团队维护
 */

import { LucideIconName } from '@/lib/icon-mapping'
import type { ExpertResult } from '@/store/canvasStore'

export interface SystemAgent {
  agentId: string        // 语义化ID，如 sys-search
  name: string           // 显示名称
  description: string    // 描述
  iconName: string      // 图标名称（用于动态导入）
  category: string       // 分类
  color: string         // 渐变色
  graphId: string       // LangGraph 工作流标识符
  capabilities: string[]  // 启用的工具/特性
}

/**
 * 专家类型
 */
export type ExpertType = 'search' | 'coder' | 'researcher' | 'analyzer' | 'writer' | 'planner' | 'image_analyzer'

/**
 * 专家配置（简化版，用于 ExpertStatusBar）
 */
export const EXPERT_CONFIG: Record<ExpertType, { icon: string; color: string; name: string }> = {
  search: { icon: '🔍', color: 'violet', name: '搜索专家' },
  coder: { icon: '💻', color: 'indigo', name: '编程专家' },
  researcher: { icon: '📚', color: 'emerald', name: '研究专家' },
  analyzer: { icon: '📊', color: 'blue', name: '分析专家' },
  writer: { icon: '✍️', color: 'teal', name: '写作专家' },
  planner: { icon: '📋', color: 'orange', name: '规划专家' },
  image_analyzer: { icon: '🖼️', color: 'pink', name: '图片分析专家' }
} as const

/**
 * 系统智能体列表
 * 用于复杂任务处理，经过 LangGraph 工作流
 */
export const SYSTEM_AGENTS: SystemAgent[] = [
  {
    agentId: 'sys-assistant',
    name: '通用助手',
    description: '日常对话、通用任务、智能问答',
    iconName: 'Bot',
    category: '通用',
    color: 'from-violet-500 to-purple-500',
    graphId: 'assistant',
    capabilities: ['general-conversation', 'task-handling', 'qa']
  },
  {
    agentId: 'sys-search',
    name: '搜索专家',
    description: '信息搜索、查询分析、结果整理',
    iconName: 'Search',
    category: '信息',
    color: 'from-blue-500 to-cyan-500',
    graphId: 'search',
    capabilities: ['web-search', 'information-retrieval', 'result-organization']
  },
  {
    agentId: 'sys-coder',
    name: '编程专家',
    description: '代码编写、调试优化、代码审查',
    iconName: 'Code',
    category: '开发',
    color: 'from-green-500 to-emerald-500',
    graphId: 'coder',
    capabilities: ['code-generation', 'debugging', 'code-review', 'best-practices']
  },
  {
    agentId: 'sys-researcher',
    name: '研究专家',
    description: '深度调研、文献分析、知识问答',
    iconName: 'FileText',
    category: '研究',
    color: 'from-purple-500 to-violet-500',
    graphId: 'researcher',
    capabilities: ['literature-review', 'technical-research', 'knowledge-query']
  },
  {
    agentId: 'sys-analyzer',
    name: '分析专家',
    description: '逻辑推理、数据分析、问题诊断',
    iconName: 'Layout',
    category: '分析',
    color: 'from-rose-500 to-pink-500',
    graphId: 'analyzer',
    capabilities: ['logic-analysis', 'data-reasoning', 'problem-diagnosis']
  },
  {
    agentId: 'sys-writer',
    name: '写作专家',
    description: '文案创作、内容撰写、文档整理',
    iconName: 'PenTool',
    category: '创作',
    color: 'from-amber-500 to-orange-500',
    graphId: 'writer',
    capabilities: ['content-creation', 'copywriting', 'document-organization']
  },
  {
    agentId: 'sys-planner',
    name: '规划专家',
    description: '任务拆解、方案设计、流程规划',
    iconName: 'MessageSquare',
    category: '规划',
    color: 'from-indigo-500 to-blue-500',
    graphId: 'planner',
    capabilities: ['task-breakdown', 'solution-design', 'workflow-planning']
  },
  {
    agentId: 'sys-image-analyzer',
    name: '图片分析专家',
    description: '图片识别、内容分析、视觉解读',
    iconName: 'Image',
    category: '视觉',
    color: 'from-teal-500 to-cyan-500',
    graphId: 'image_analyzer',
    capabilities: ['image-recognition', 'content-analysis', 'visual-interpretation']
  }
]

/**
 * 根据 agentId 查找系统智能体
 *
 * @param agentId - 智能体 ID（如 'sys-assistant', 'sys-search'）
 * @returns SystemAgent | undefined - 找到的智能体配置，如果不存在返回 undefined
 *
 * @example
 * ```typescript
 * const agent = getSystemAgent('sys-search')
 * console.log(agent.name) // '搜索专家'
 * const missing = getSystemAgent('invalid')
 * console.log(missing) // undefined
 * ```
 */
export function getSystemAgent(agentId: string): SystemAgent | undefined {
  return SYSTEM_AGENTS.find(agent => agent.agentId === agentId)
}

/**
 * 判断是否为系统智能体
 *
 * @param agentId - 智能体 ID
 * @returns boolean - 如果是系统智能体返回 true，否则返回 false
 *
 * @example
 * ```typescript
 * const isSys = isSystemAgent('sys-assistant') // true
 * const isCustom = isSystemAgent('custom-agent') // false
 * ```
 */
export function isSystemAgent(agentId: string): boolean {
  return SYSTEM_AGENTS.some(agent => agent.agentId === agentId)
}

/**
 * 获取默认系统智能体
 *
 * @returns SystemAgent - 默认的通用助手智能体
 *
 * @example
 * ```typescript
 * const defaultAgent = getDefaultSystemAgent()
 * console.log(defaultAgent.name) // '通用助手'
 * ```
 */
export function getDefaultSystemAgent(): SystemAgent {
  return SYSTEM_AGENTS[0] // 通用助手
}

/**
 * 获取专家名称（带兜底）
 *
 * @param expertType - 专家类型（如 'search', 'coder'）
 * @returns string - 专家名称，如果不存在返回专家类型本身
 *
 * @example
 * ```typescript
 * const name = getExpertName('search') // '搜索专家'
 * const unknown = getExpertName('unknown') // 'unknown'
 * ```
 */
export function getExpertName(expertType: string): string {
  return EXPERT_CONFIG[expertType as ExpertType]?.name || expertType
}

/**
 * 获取专家配置（带兜底）
 *
 * @param expertType - 专家类型（如 'search', 'coder'）
 * @returns { icon: string; color: string; name: string } - 专家配置对象
 *
 * @description
 * 返回包含图标、颜色和名称的配置对象
 * 如果专家类型不存在，返回默认配置（机器人图标、灰色、原始类型名）
 *
 * @example
 * ```typescript
 * const config = getExpertConfig('search')
 * console.log(config.icon) // '🔍'
 * console.log(config.color) // 'violet'
 * console.log(config.name) // '搜索专家'
 * ```
 */
export function getExpertConfig(expertType: string) {
  return EXPERT_CONFIG[expertType as ExpertType] || {
    icon: '🤖',
    color: 'gray',
    name: expertType
  }
}

/**
 * 创建专家结果对象
 *
 * @param expertType - 专家类型（如 'search', 'coder'）
 * @param status - 专家状态（默认 'pending'）
 * @returns ExpertResult - 专家结果对象
 *
 * @description
 * 创建标准化的专家结果对象，包含专家类型、名称、描述、状态和开始时间
 * 自动从 EXPERT_CONFIG 获取专家名称和生成任务描述
 *
 * @example
 * ```typescript
 * const result = createExpertResult('search', 'running')
 * console.log(result.expertName) // '搜索专家'
 * console.log(result.status) // 'running'
 * console.log(result.description) // '执行搜索专家任务'
 * ```
 */
export function createExpertResult(
  expertType: string,
  status: ExpertResult['status'] = 'pending'
): ExpertResult {
  const config = getExpertConfig(expertType)
  return {
    expertType,
    expertName: config.name,
    description: `执行${config.name}任务`,
    status,
    startedAt: new Date().toISOString()
  }
}


