/**
 * 管理员 API 服务
 */

import { getHeaders } from './api'

// ============================================================================
// 专家管理类型
// ============================================================================

export interface ExpertResponse {
  id: number
  expert_key: string
  name: string
  system_prompt: string
  model: string
  temperature: number
  updated_at: string
}

export interface ExpertUpdateRequest {
  system_prompt: string
  model?: string
  temperature?: number
}

export interface PromoteUserRequest {
  email: string
}

// ============================================================================
// 专家管理 API
// ============================================================================

/**
 * 获取所有专家列表
 */
export async function getAllExperts(): Promise<ExpertResponse[]> {
  const response = await fetch('/api/admin/experts', {
    method: 'GET',
    headers: getHeaders()
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || '获取专家列表失败')
  }

  return await response.json()
}

/**
 * 获取单个专家配置
 */
export async function getExpert(expertKey: string): Promise<ExpertResponse> {
  const response = await fetch(`/api/admin/experts/${expertKey}`, {
    method: 'GET',
    headers: getHeaders()
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || '获取专家配置失败')
  }

  return await response.json()
}

/**
 * 更新专家配置
 */
export async function updateExpert(
  expertKey: string,
  data: ExpertUpdateRequest
): Promise<{ message: string; expert_key: string; updated_at: string }> {
  const response = await fetch(`/api/admin/experts/${expertKey}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify(data)
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || '更新专家配置失败')
  }

  return await response.json()
}

/**
 * 升级用户为管理员
 */
export async function promoteUser(
  email: string
): Promise<{ message: string; username: string; email: string }> {
  const response = await fetch('/api/admin/promote-user', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ email })
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || '升级用户失败')
  }

  return await response.json()
}
