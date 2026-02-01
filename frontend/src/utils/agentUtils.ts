import { SYSTEM_AGENTS, isSystemAgent } from '@/constants/agents'
import { getClientId } from '@/services/common'
import type { AgentType } from '@/types'

/**
 * 旧 ID 到新 ID 的映射（与后端 constants.py 保持一致）
 * 
 * 注意：所有旧 ID 都映射到 DEFAULT_CHAT，因为复杂模式是内部状态
 * 不应该通过 URL 中的 agentId 来区分简单/复杂模式
 */
const OLD_TO_NEW_AGENT_ID_MAPPING: Record<string, string> = {
  'default-assistant': SYSTEM_AGENTS.DEFAULT_CHAT,
  'ai-assistant': SYSTEM_AGENTS.DEFAULT_CHAT, // 👈 旧复杂模式 ID 也映射到默认助手
  'default-chat': SYSTEM_AGENTS.DEFAULT_CHAT, // 兼容 UnifiedChatPage 中的默认值
  'assistant': SYSTEM_AGENTS.DEFAULT_CHAT, // 兼容 chatStore 初始值
  'sys-task-orchestrator': SYSTEM_AGENTS.DEFAULT_CHAT, // 👈 内部 ID 映射到默认助手
}

/**
 * 规范化智能体 ID
 * 将旧的硬编码 ID 映射到新的语义化 ID
 * 如果已经是新 ID，则直接返回
 */
export function normalizeAgentId(agentId: string): string {
  return OLD_TO_NEW_AGENT_ID_MAPPING[agentId] || agentId
}

/**
 * 判断智能体类型（默认助手 / AI助手 / 自定义）
 */
export function getAgentType(agentId: string): AgentType {
  const normalizedId = normalizeAgentId(agentId)
  if (isSystemAgent(normalizedId)) {
    return 'system'
  }
  return 'custom'
}

/**
 * 生成 Thread ID（根据智能体类型）
 */
export function getThreadId(agentId: string, userId?: string): string {
  const normalizedId = normalizeAgentId(agentId)
  const agentType = getAgentType(normalizedId)

  if (agentType === 'system') {
    // 系统智能体：使用 ${userId}_${agentId}
    const clientId = getClientId()
    // 提取语义化的 graphId（移除 sys- 前缀）
    const graphId = normalizedId.replace('sys-', '')
    return `exp_${clientId}_${graphId}`
  } else {
    // 自定义智能体：使用 cus_${agentId}
    return `cus_${agentId}`
  }
}

/**
 * 判断对话模式（根据 thread_mode）
 * 
 * @deprecated 不要通过 agentId 判断模式！
 * 复杂模式是 Thread 的内部状态，应该通过后端返回的 thread_mode 字段判断
 * 
 * 正确用法：
 * const mode = thread.thread_mode // 'simple' | 'complex'
 */
export function getConversationMode(agentId: string): 'simple' | 'complex' {
  // 👈 所有对话都返回 'simple'，因为复杂模式是内部状态
  // 不应该通过 URL 中的 agentId 来判断模式
  // 前端应该通过后端返回的 thread_mode 字段来感知模式
  return 'simple'
}

/**
 * 从后端 Thread 数据获取对话模式
 * 
 * @param threadMode - 后端返回的 thread_mode 字段
 * @returns 'simple' | 'complex'
 * 
 * @example
 * ```typescript
 * const mode = getModeFromThread(thread.thread_mode) // 'simple' 或 'complex'
 * ```
 */
export function getModeFromThread(threadMode?: string): 'simple' | 'complex' {
  return threadMode === 'complex' ? 'complex' : 'simple'
}