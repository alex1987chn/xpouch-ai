/**
 * 系统智能体常量定义
 * 
 * @description
 * 定义系统内置智能体的语义化 ID，替代硬编码字符串。
 * 注意：sys-task-orchestrator 是后端内部实现，不应在 URL 中暴露
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
 * const agentId: SystemAgentId = SYSTEM_AGENTS.DEFAULT_CHAT // ✅ 正确
 * const invalidId: SystemAgentId = 'custom-agent' // ❌ 类型错误
 * ```
 */
export type SystemAgentId = 'sys-default-chat' | 'sys-task-orchestrator'

/**
 * 系统智能体常量对象
 * 
 * @description
 * - `DEFAULT_CHAT`: 默认通用助手，所有对话的统一入口
 * 
 * 复杂模式 (Complex Mode) 是 Thread 的内部状态 (thread_mode='complex')，
 * 不是一个独立的 Agent ID。前端通过后端返回的 thread_mode 判断模式。
 * 
 * @example
 * ```typescript
 * import { SYSTEM_AGENTS } from '@/constants/agents'
 * 
 * // 所有对话都使用默认助手作为入口
 * const agentId = SYSTEM_AGENTS.DEFAULT_CHAT
 * 
 * // 后端 Router 决定是简单模式还是复杂模式
 * // 简单模式: thread_mode='simple' (直接回复)
 * // 复杂模式: thread_mode='complex' (专家协作)
 * 
 * console.log(agentId) // 'sys-default-chat'
 * ```
 */
export const SYSTEM_AGENTS = {
  /**
   * 默认通用助手 ID - 所有对话的统一入口
   * 
   * @description
   * 无论是简单模式还是复杂模式，前端都使用此 ID 作为入口。
   * 后端 Router 决定实际执行路径：
   * - 简单查询 -> 直接调用 LLM -> thread_mode='simple'
   * - 复杂任务 -> LangGraph 专家协作 -> thread_mode='complex'
   * 
   * 对应前端显示名称："默认助手"
   */
  DEFAULT_CHAT: 'sys-default-chat',
  
  /**
   * 任务编排器 ID - 复杂模式的内部实现
   * 
   * @description
   * 这是后端 LangGraph 复杂模式的内部智能体 ID。
   * 前端不应该直接在 URL 中使用此 ID，而是通过 DEFAULT_CHAT 作为入口，
   * 让后端 Router 决定是否进入编排器模式。
   * 
   * 此 ID 主要用于：
   * - 旧 ID 映射（ai-assistant -> ORCHESTRATOR）
   * - 后端事件路由
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
 * getSystemAgentName('custom-uuid') // 'custom-uuid'
 * ```
 */
export function getSystemAgentName(agentId: string): string {
  const names: Record<SystemAgentId, string> = {
    'sys-default-chat': '默认助手',
    'sys-task-orchestrator': '任务编排器'
  }
  return names[agentId as SystemAgentId] || agentId
}
