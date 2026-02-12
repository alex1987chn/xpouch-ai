/**
 * 智能体相关 API 服务
 */

import { getHeaders, buildUrl, handleResponse } from './common'
import type { Agent } from '@/types'

// 重新导出类型供外部使用（Agent 类型来自 @/types）
export type { Agent }

// ============================================================================
// 类型定义
// ============================================================================

export interface CustomAgent {
  id: string
  user_id: string
  name: string
  description?: string
  system_prompt: string
  model_id: string
  category: string
  conversation_count: number
  is_public: boolean
  created_at: string
  updated_at: string
}

export interface CreateAgentRequest {
  name: string
  description?: string
  systemPrompt: string
  category?: string
  modelId?: string
}

export interface AgentDisplay {
  id: string
  name: string
  description: string
  icon: string
  isCustom?: boolean
}

// ============================================================================
// API 函数
// ============================================================================

/**
 * 创建自定义智能体
 */
export async function createCustomAgent(
  agent: CreateAgentRequest
): Promise<CustomAgent> {
  const response = await fetch(buildUrl('/agents'), {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(agent)
  })
  return handleResponse<CustomAgent>(response, '创建智能体失败')
}

/**
 * 获取所有自定义智能体
 */
export async function getAllAgents(): Promise<AgentDisplay[]> {
  const response = await fetch(buildUrl('/agents'), {
    headers: getHeaders()
  })
  const data = await handleResponse<CustomAgent[]>(response, '获取智能体列表失败')

  // 转换为显示格式
  return data.map((agent): AgentDisplay => ({
    id: agent.id,
    name: agent.name,
    description: agent.description || '',
    icon: 'bot', // 默认图标
    isCustom: true
  }))
}

/**
 * 获取单个自定义智能体
 */
export async function getCustomAgent(id: string): Promise<CustomAgent> {
  const response = await fetch(buildUrl(`/agents/${id}`), {
    headers: getHeaders()
  })
  return handleResponse<CustomAgent>(response, '获取智能体详情失败')
}

/**
 * 更新自定义智能体
 */
export async function updateCustomAgent(
  id: string,
  agent: Partial<CreateAgentRequest>
): Promise<CustomAgent> {
  const response = await fetch(buildUrl(`/agents/${id}`), {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(agent)
  })
  return handleResponse<CustomAgent>(response, '更新智能体失败')
}

/**
 * 删除自定义智能体
 */
export async function deleteCustomAgent(id: string): Promise<void> {
  const response = await fetch(buildUrl(`/agents/${id}`), {
    method: 'DELETE',
    headers: getHeaders()
  })
  return handleResponse<void>(response, '删除智能体失败')
}
