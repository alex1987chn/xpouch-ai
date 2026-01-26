import { SYSTEM_AGENTS, isSystemAgent } from '@/constants/agents'
import { getClientId } from '@/services/api'
import type { AgentType } from '@/types'

/**
 * 判断智能体类型（默认助手 / AI助手 / 自定义）
 */
export function getAgentType(agentId: string): AgentType {
  if (isSystemAgent(agentId)) {
    return 'system'
  }
  return 'custom'
}

/**
 * 生成 Thread ID（根据智能体类型）
 */
export function getThreadId(agentId: string, userId?: string): string {
  const agentType = getAgentType(agentId)

  if (agentType === 'system') {
    // 系统智能体：使用 ${userId}_${agentId}
    const clientId = getClientId()
    // 提取语义化的 graphId（移除 sys- 前缀）
    const graphId = agentId.replace('sys-', '')
    return `exp_${clientId}_${graphId}`
  } else {
    // 自定义智能体：使用 cus_${agentId}
    return `cus_${agentId}`
  }
}

/**
 * 判断对话模式（根据 agentId）
 * sys-task-orchestrator 是复杂模式，其他都是简单模式
 */
export function getConversationMode(agentId: string): 'simple' | 'complex' {
  if (agentId === SYSTEM_AGENTS.ORCHESTRATOR) {
    return 'complex'
  }
  return 'simple'
}