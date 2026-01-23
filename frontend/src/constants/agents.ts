/**
 * 系统智能体常量定义
 * 
 * @description
 * 定义系统内置智能体的语义化 ID，替代硬编码字符串。
 * 这些常量确保前后端使用统一的智能体标识，提高代码可维护性。
 * 
 * @module constants/agents
 */

/**
 * 系统智能体 ID 类型
 * 
 * @description
 * TypeScript 字面量类型，用于类型检查和自动补全
 * 
 * @example
 * ```typescript
 * const agentId: SystemAgentId = SYSTEM_AGENTS.ORCHESTRATOR // ✅ 正确
 * const invalidId: SystemAgentId = 'custom-agent' // ❌ 类型错误
 * ```
 */
export type SystemAgentId = 'sys-default-chat' | 'sys-task-orchestrator'

/**
 * 系统智能体常量对象
 * 
 * @description
 * - `DEFAULT_CHAT`: 默认通用助手（简单模式），直接调用 LLM
 * - `ORCHESTRATOR`: 任务指挥官（复杂模式），通过 LangGraph 调度专家
 * 
 * @example
 * ```typescript
 * import { SYSTEM_AGENTS } from '@/constants/agents'
 * 
 * // 简单模式
 * const simpleModeAgentId = SYSTEM_AGENTS.DEFAULT_CHAT
 * // 复杂模式
 * const complexModeAgentId = SYSTEM_AGENTS.ORCHESTRATOR
 * 
 * console.log(simpleModeAgentId) // 'sys-default-chat'
 * console.log(complexModeAgentId) // 'sys-task-orchestrator'
 * ```
 */
export const SYSTEM_AGENTS = {
  /**
   * 默认通用助手 ID
   * 
   * @description
   * 简单模式使用的智能体，直接调用大模型，不经过 LangGraph
   * 对应前端显示名称："默认助手"
   */
  DEFAULT_CHAT: 'sys-default-chat',

  /**
   * 任务指挥官 ID
   * 
   * @description
   * 复杂模式使用的智能体，通过 LangGraph 工作流调度多个专家协作
   * 对应前端显示名称："AI 助手"
   */
  ORCHESTRATOR: 'sys-task-orchestrator'
} as const

/**
 * 判断是否为系统智能体
 * 
 * @param agentId - 智能体 ID
 * @returns boolean - 是否为系统智能体
 * 
 * @description
 * 检查给定的智能体 ID 是否属于系统内置智能体
 * 
 * @example
 * ```typescript
 * isSystemAgent('sys-default-chat') // true
 * isSystemAgent('sys-task-orchestrator') // true
 * isSystemAgent('custom-uuid-123') // false
 * isSystemAgent('ai-assistant') // false (旧格式，需要迁移)
 * ```
 */
export function isSystemAgent(agentId: string): agentId is SystemAgentId {
  return Object.values(SYSTEM_AGENTS).includes(agentId as SystemAgentId)
}

/**
 * 获取系统智能体的显示名称
 * 
 * @param agentId - 系统智能体 ID
 * @returns string - 智能体显示名称
 * 
 * @description
 * 根据系统智能体 ID 返回用户友好的显示名称
 * 如果不是系统智能体，返回原 ID
 * 
 * @example
 * ```typescript
 * getSystemAgentName('sys-default-chat') // '默认助手'
 * getSystemAgentName('sys-task-orchestrator') // 'AI 助手'
 * getSystemAgentName('custom-uuid') // 'custom-uuid'
 * ```
 */
export function getSystemAgentName(agentId: string): string {
  const names: Record<SystemAgentId, string> = {
    'sys-default-chat': '默认助手',
    'sys-task-orchestrator': 'AI 助手'
  }
  return names[agentId as SystemAgentId] || agentId
}
