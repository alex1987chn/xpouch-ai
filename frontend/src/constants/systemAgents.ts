/**
 * 专家配置（用于复杂模式专家展示）
 * 这些是 LangGraph 工作流中的内部专家，前端不直接暴露给用户
 *
 * v3.1: ExpertStatusBar 已废弃，现在使用 BusRail 组件展示专家
 */

/**
 * 专家类型
 */
export type ExpertType = 'search' | 'coder' | 'researcher' | 'analyzer' | 'writer' | 'planner' | 'image_analyzer' | 'designer' | 'architect'

/**
 * v3.1: 内联 ExpertResult 类型（原定义在 canvasStore，现内联避免循环依赖）
 * @deprecated 复杂模式现在使用 taskStore，此类型保留用于兼容旧代码
 */
export interface ExpertResult {
  expertType: string
  expertName: string
  description: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  startedAt: string
  completedAt?: string
  duration?: number
  output?: string
  error?: string
}

/**
 * 专家配置（用于 BusRail 和复杂模式专家展示）
 * v3.1: icon 字段已废弃，BusRail 使用专家名称缩写（如 SRCH, CODE）
 */
export const EXPERT_CONFIG: Record<string, { name: string }> = {
  search: { name: '搜索专家' },
  coder: { name: '编程专家' },
  researcher: { name: '研究专家' },
  analyzer: { name: '分析专家' },
  writer: { name: '写作专家' },
  planner: { name: '规划专家' },
  designer: { name: '设计专家' },
  architect: { name: '架构专家' },
  image_analyzer: { name: '图片分析专家' }
} as const

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
 * @returns { name: string } - 专家配置对象
 *
 * @description
 * 返回包含名称的配置对象
 * 如果专家类型不存在，返回默认配置（原始类型名）
 *
 * @example
 * ```typescript
 * const config = getExpertConfig('search')
 * console.log(config.name) // '搜索专家'
 * ```
 */
export function getExpertConfig(expertType: string) {
  return EXPERT_CONFIG[expertType as ExpertType] || {
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


