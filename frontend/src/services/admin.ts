/**
 * 管理员相关 API 服务
 * 
 * P0 修复: 添加 credentials: 'include' 以支持 HttpOnly Cookie
 */

import { getHeaders, buildUrl, handleResponse } from './common'

// ============================================================================
// 类型定义
// ============================================================================

export interface SystemExpert {
  id: number
  expert_key: string
  name: string
  description?: string
  system_prompt: string
  model: string
  temperature: number
  is_dynamic: boolean
  is_system: boolean
  updated_at: string
}

export interface UpdateExpertRequest {
  system_prompt: string
  description?: string
  model: string
  temperature: number
}

export interface CreateExpertRequest {
  expert_key: string
  name: string
  description?: string
  system_prompt: string
  model: string
  temperature: number
}

export interface GenerateDescriptionRequest {
  system_prompt: string
}

export interface GenerateDescriptionResponse {
  description: string
  generated_at: string
}

export interface PreviewExpertRequest {
  expert_key: string
  test_input: string
}

export interface PreviewExpertResponse {
  response: string
  execution_time_ms: number
}

export interface PromoteUserRequest {
  email: string
  role: 'admin'
}

// ============================================================================
// API 函数
// ============================================================================

/**
 * 获取所有系统专家配置
 */
export async function getAllExperts(): Promise<SystemExpert[]> {
  const response = await fetch(buildUrl('/admin/experts'), {
    headers: getHeaders(),
    // P0 修复: 允许携带 Cookie
    credentials: 'include'
  })
  return handleResponse<SystemExpert[]>(response, '获取专家列表失败')
}

/**
 * 更新专家配置
 */
export async function updateExpert(
  expertKey: string,
  data: UpdateExpertRequest
): Promise<SystemExpert> {
  const response = await fetch(buildUrl(`/admin/experts/${expertKey}`), {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify(data),
    // P0 修复: 允许携带 Cookie
    credentials: 'include'
  })
  return handleResponse<SystemExpert>(response, '更新专家配置失败')
}

/**
 * 预览专家响应
 */
export async function previewExpert(
  data: PreviewExpertRequest
): Promise<PreviewExpertResponse> {
  const response = await fetch(buildUrl('/admin/experts/preview'), {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data),
    // P0 修复: 允许携带 Cookie
    credentials: 'include'
  })
  return handleResponse<PreviewExpertResponse>(response, '预览专家响应失败')
}

/**
 * 升级用户为管理员
 */
export async function promoteUser(data: PromoteUserRequest): Promise<void> {
  const response = await fetch(buildUrl('/admin/promote-user'), {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data),
    // P0 修复: 允许携带 Cookie
    credentials: 'include'
  })
  return handleResponse<void>(response, '升级用户失败')
}

/**
 * 获取单个专家配置
 */
export async function getExpert(expertKey: string): Promise<SystemExpert> {
  const response = await fetch(buildUrl(`/admin/experts/${expertKey}`), {
    headers: getHeaders(),
    // P0 修复: 允许携带 Cookie
    credentials: 'include'
  })
  return handleResponse<SystemExpert>(response, '获取专家配置失败')
}

/**
 * 根据 System Prompt 自动生成专家描述
 */
export async function generateExpertDescription(
  data: GenerateDescriptionRequest
): Promise<GenerateDescriptionResponse> {
  const response = await fetch(buildUrl('/admin/experts/generate-description'), {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data),
    // P0 修复: 允许携带 Cookie
    credentials: 'include'
  })
  return handleResponse<GenerateDescriptionResponse>(response, '生成描述失败')
}

/**
 * 创建新专家
 */
export async function createExpert(data: CreateExpertRequest): Promise<SystemExpert> {
  const response = await fetch(buildUrl('/admin/experts'), {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data),
    // P0 修复: 允许携带 Cookie
    credentials: 'include'
  })
  return handleResponse<SystemExpert>(response, '创建专家失败')
}

/**
 * 删除专家
 */
export async function deleteExpert(expertKey: string): Promise<void> {
  const response = await fetch(buildUrl(`/admin/experts/${expertKey}`), {
    method: 'DELETE',
    headers: getHeaders(),
    // P0 修复: 允许携带 Cookie
    credentials: 'include'
  })
  return handleResponse<void>(response, '删除专家失败')
}
