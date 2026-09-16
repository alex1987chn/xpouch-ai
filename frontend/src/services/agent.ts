/**
 * 智能体相关 API 服务
 * 
 * P0 修复: 添加 credentials: 'include' 以支持 HttpOnly Cookie
 */

import { getHeaders, buildUrl, handleResponse, authenticatedFetch } from './common'
import type { Agent } from '@/types'

// 重新导出类型供外部使用（Agent 类型来自 @/types）
export type { Agent }

// ============================================================================
// 类型定义
// ============================================================================

export interface AgentDisplay {
  id: string
  name: string
  description: string
  icon: string
  isCustom?: boolean
  /** 列表页/编辑页需要的扩展字段（后端返回但此前未声明） */
  is_default?: boolean
  system_prompt?: string
  category?: string
  model_id?: string
}

// ============================================================================
// API 函数
// ============================================================================

/**
 * 创建自定义智能体
 */

/** 自定义智能体的服务端行形状（列表接口的原始返回） */
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

export interface PaginatedAgentsResponse {
  items: CustomAgent[]
  total: number
  page: number
  page_size: number
  pages: number
}

export async function getAllAgents(page: number = 1, pageSize: number = 20): Promise<AgentDisplay[]> {
  const response = await authenticatedFetch(buildUrl(`/agents?page=${page}&page_size=${pageSize}`), {
    headers: getHeaders()
  })
  const data = await handleResponse<PaginatedAgentsResponse>(response, '获取智能体列表失败')

  // 转换为显示格式
  return data.items.map((agent): AgentDisplay => ({
    id: agent.id,
    name: agent.name,
    description: agent.description || '',
    icon: 'bot', // 默认图标
    isCustom: true,
    is_default: false,
    system_prompt: agent.system_prompt || '',
    category: agent.category || '综合',
    model_id: agent.model_id || ''
  }))
}

/**
 * 获取单个自定义智能体
 */

export async function deleteCustomAgent(id: string): Promise<void> {
  const response = await authenticatedFetch(buildUrl(`/agents/${id}`), {
    method: 'DELETE',
    headers: getHeaders()
  })
  return handleResponse<void>(response, '删除智能体失败')
}
