/**
 * 管理员相关 API 服务
 * 
 * P0 修复: 添加 credentials: 'include' 以支持 HttpOnly Cookie
 */

import { getHeaders, buildUrl, handleResponse, authenticatedFetch } from './common'

// ============================================================================
// 类型定义
// ============================================================================

export interface SystemExpert {
  id: string
  expert_key: string
  name: string
  description?: string
  system_prompt: string
  model: string
  temperature: number
  is_dynamic: boolean
  is_system: boolean
  config_version: number  // 🔥 乐观锁版本号
  updated_at: string
}

export interface UpdateExpertRequest {
  system_prompt: string
  description?: string
  model: string
  temperature: number
  expected_version: number  // 🔥 乐观锁：必须传当前版本号
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
  expert_name: string
  test_input: string
  preview_response: string
  model: string
  temperature: number
  execution_time_ms: number
}

export interface PromoteUserRequest {
  email: string
  role: 'admin'
}

// 🔥 工具相关类型
export interface ToolInfo {
  name: string
  description: string
  category: 'builtin' | 'mcp'
}

export interface ToolsListResponse {
  tools: ToolInfo[]
  total: number
  builtin_count: number
  mcp_count: number
}

// ============================================================================
// API 函数
// ============================================================================

/**
 * 获取所有系统专家配置
 */
export async function getAllExperts(): Promise<SystemExpert[]> {
  const response = await authenticatedFetch(buildUrl('/admin/experts'), {
    headers: getHeaders()
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
  const response = await authenticatedFetch(buildUrl(`/admin/experts/${expertKey}`), {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify(data)
  })
  return handleResponse<SystemExpert>(response, '更新专家配置失败')
}

/**
 * 预览专家响应
 */
export async function previewExpert(
  data: PreviewExpertRequest
): Promise<PreviewExpertResponse> {
  const response = await authenticatedFetch(buildUrl('/admin/experts/preview'), {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data)
  })
  return handleResponse<PreviewExpertResponse>(response, '预览专家响应失败')
}

/**
 * 升级用户为管理员
 */
export async function promoteUser(data: PromoteUserRequest): Promise<void> {
  const response = await authenticatedFetch(buildUrl('/admin/promote-user'), {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data)
  })
  return handleResponse<void>(response, '升级用户失败')
}

/**
 * 获取单个专家配置
 */
export async function getExpert(expertKey: string): Promise<SystemExpert> {
  const response = await authenticatedFetch(buildUrl(`/admin/experts/${expertKey}`), {
    headers: getHeaders()
  })
  return handleResponse<SystemExpert>(response, '获取专家配置失败')
}

/**
 * 根据 System Prompt 自动生成专家描述
 */
export async function generateExpertDescription(
  data: GenerateDescriptionRequest
): Promise<GenerateDescriptionResponse> {
  const response = await authenticatedFetch(buildUrl('/admin/experts/generate-description'), {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data)
  })
  return handleResponse<GenerateDescriptionResponse>(response, '生成描述失败')
}

/**
 * 创建新专家
 */
export async function createExpert(data: CreateExpertRequest): Promise<SystemExpert> {
  const response = await authenticatedFetch(buildUrl('/admin/experts'), {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data)
  })
  return handleResponse<SystemExpert>(response, '创建专家失败')
}

/**
 * 删除专家
 */
export async function deleteExpert(expertKey: string): Promise<void> {
  const response = await authenticatedFetch(buildUrl(`/admin/experts/${expertKey}`), {
    method: 'DELETE',
    headers: getHeaders()
  })
  return handleResponse<void>(response, '删除专家失败')
}

/**
 * 获取可用工具列表
 */
export async function getAvailableTools(): Promise<ToolsListResponse> {
  const response = await authenticatedFetch(buildUrl('/tools/available'), {
    headers: getHeaders()
  })
  return handleResponse<ToolsListResponse>(response, '获取工具列表失败')
}
