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




