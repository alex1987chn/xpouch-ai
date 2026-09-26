/**
 * 管理员相关 API 服务
 *
 * 契约真相源是后端（→ api.generated.ts）。请求 DTO 直接取生成物别名
 * （T2 请求侧锚点，2026-09-27）——不是"检测漂移"而是结构上不可能漂移：
 * 后端改字段这里编译期即红。响应类型仍为手写 + 文件底部 SameShape 锚点。
 *
 * P0 修复: 添加 credentials: 'include' 以支持 HttpOnly Cookie
 */

import type { ToolRiskTier } from '@/types/enums.generated'
import type { components } from '@/types/api.generated'
import { getHeaders, buildUrl, handleResponse, authenticatedFetch } from './common'

// ============================================================================
// 类型定义
// ============================================================================

type Schemas = components['schemas']

export interface SystemExpert {
  id: string
  expert_type: string
  name: string
  description: string | null
  system_prompt: string
  model: string
  temperature: number
  is_dynamic: boolean
  is_system: boolean
  config_version: number  // 🔥 乐观锁版本号
  updated_at: string
}

// 请求 DTO：生成物别名（wire 形状由后端单一真相源决定；可选性差异以契约为准）
export type UpdateExpertRequest = Schemas['ExpertUpdate']
export type CreateExpertRequest = Schemas['ExpertCreate']
export type GenerateDescriptionRequest = Schemas['GenerateDescriptionRequest']
export type PreviewExpertRequest = Schemas['ExpertPreviewRequest']
export type PromoteUserRequest = Schemas['UserPromoteRequest']
export type ToolPolicyUpdateRequest = Schemas['ToolPolicyUpdate']
export type SkillTemplateCreateRequest = Schemas['SkillTemplateCreate']
export type SkillTemplateUpdateRequest = Schemas['SkillTemplateUpdate']
export type AdminUserUpdateRequest = Schemas['AdminUserUpdate']
export type AdminResetPasswordRequest = Schemas['AdminResetPasswordRequest']
export type AdminCreateUserRequest = Schemas['AdminCreateUserRequest']

export interface GenerateDescriptionResponse {
  description: string
  generated_at: string
  temperature: number
  execution_time_ms: number
}

export interface PreviewExpertResponse {
  expert_name: string
  test_input: string
  preview_response: string
  model: string
  temperature: number
  execution_time_ms: number
}

// 🔥 工具相关类型
export interface ToolInfo {
  name: string
  description: string
  category: 'builtin' | 'mcp'
  enabled: boolean
  risk_tier: ToolRiskTier
  approval_required: boolean
  allowed_experts?: string[] | null
  blocked_experts?: string[] | null
  policy_note?: string | null
}

export interface ToolsListResponse {
  tools: ToolInfo[]
  total: number
  builtin_count: number
  mcp_count: number
}

export interface ToolPolicyRecord {
  id?: string | null
  tool_name: string
  source: 'builtin' | 'mcp'
  enabled: boolean
  risk_tier: ToolRiskTier
  approval_required: boolean
  allowed_experts?: string[] | null
  blocked_experts?: string[] | null
  policy_note?: string | null
  description?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export interface ToolPolicyListResponse {
  policies: ToolPolicyRecord[]
  total: number
}

export interface SkillTemplate {
  id: string
  template_key: string
  name: string
  description?: string | null
  category: string
  starter_prompt: string
  system_hint?: string | null
  recommended_mode: 'simple' | 'complex'
  suggested_tags?: string[] | null
  tool_hints?: string[] | null
  expected_artifact_types?: string[] | null
  artifact_schema_hint?: string | null
  is_active: boolean
  is_builtin: boolean
  created_at: string
  updated_at: string
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

export async function getToolPolicies(): Promise<ToolPolicyListResponse> {
  const response = await authenticatedFetch(buildUrl('/tools/policies'), {
    headers: getHeaders(),
  })
  return handleResponse<ToolPolicyListResponse>(response, '获取工具治理策略失败')
}

export async function updateToolPolicy(
  source: 'builtin' | 'mcp',
  toolName: string,
  data: ToolPolicyUpdateRequest
): Promise<ToolPolicyRecord> {
  const response = await authenticatedFetch(buildUrl(`/tools/policies/${source}/${toolName}`), {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(data),
  })
  return handleResponse<ToolPolicyRecord>(response, '更新工具治理策略失败')
}

export async function getSkillTemplates(includeInactive = false): Promise<SkillTemplate[]> {
  const response = await authenticatedFetch(
    buildUrl(`/library/templates${includeInactive ? '?include_inactive=true' : ''}`),
    {
      headers: getHeaders(),
    }
  )
  return handleResponse<SkillTemplate[]>(response, '获取模板列表失败')
}

export async function createSkillTemplate(
  data: SkillTemplateCreateRequest
): Promise<SkillTemplate> {
  const response = await authenticatedFetch(buildUrl('/library/templates'), {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data),
  })
  return handleResponse<SkillTemplate>(response, '创建模板失败')
}

export async function updateSkillTemplate(
  templateId: string,
  data: SkillTemplateUpdateRequest
): Promise<SkillTemplate> {
  const response = await authenticatedFetch(buildUrl(`/library/templates/${templateId}`), {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(data),
  })
  return handleResponse<SkillTemplate>(response, '更新模板失败')
}

export async function deleteSkillTemplate(templateId: string): Promise<void> {
  const response = await authenticatedFetch(buildUrl(`/library/templates/${templateId}`), {
    method: 'DELETE',
    headers: getHeaders(),
  })
  return handleResponse<void>(response, '删除模板失败')
}

// ============================================================================
// 模板导入导出
// ============================================================================

export interface TemplateExportData {
  template_key: string
  name: string
  description?: string | null
  category: string
  starter_prompt: string
  system_hint?: string | null
  recommended_mode: 'simple' | 'complex'
  suggested_tags?: string[] | null
  tool_hints?: string[] | null
  expected_artifact_types?: string[] | null
  artifact_schema_hint?: string | null
}

export interface TemplateExportSchema {
  xpouch_template: {
    version: string
    schema_url: string
  }
  template: TemplateExportData
  meta: {
    exported_at: string
    exported_by?: string | null
    source_instance?: string | null
  }
}

export interface TemplateImportPreviewResponse {
  valid: boolean
  version?: string | null
  template?: TemplateExportData | null
  conflict?: {
    exists: boolean
    existing_template?: {
      id: string
      name: string
      template_key: string
      is_builtin: boolean
    } | null
    suggested_key: string
  } | null
  error?: string | null
}

export interface TemplateImportResponse {
  success: boolean
  strategy: string
  template_key?: string | null
  template_id?: string | null
  message: string
}

export type ImportStrategy = 'override' | 'clone' | 'skip'

/**
 * 导出模板
 */
export async function exportSkillTemplate(templateKey: string): Promise<TemplateExportSchema> {
  const response = await authenticatedFetch(
    buildUrl(`/library/templates/${templateKey}/export`),
    {
      headers: getHeaders(),
    }
  )
  return handleResponse<TemplateExportSchema>(response, '导出模板失败')
}

/**
 * 生成模板分享链接（仅管理员）。链接公开可读，撤销即失效
 */
export async function shareSkillTemplate(
  templateKey: string
): Promise<{ token: string; path: string; template_key: string }> {
  const response = await authenticatedFetch(
    buildUrl(`/library/templates/${encodeURIComponent(templateKey)}/share`),
    {
      method: 'POST',
      headers: getHeaders(),
    }
  )
  return handleResponse(response, '生成分享链接失败')
}

/**
 * 预览模板导入
 */
export async function previewImportSkillTemplate(
  content: string
): Promise<TemplateImportPreviewResponse> {
  const body: Schemas['TemplateImportPreviewRequest'] = { content }
  const response = await authenticatedFetch(
    buildUrl('/library/templates/import-preview'),
    {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(body),
    }
  )
  return handleResponse<TemplateImportPreviewResponse>(response, '预览导入失败')
}

/**
 * 执行模板导入
 */
export async function importSkillTemplate(
  content: string,
  strategy: ImportStrategy = 'clone',
  targetKey?: string
): Promise<TemplateImportResponse> {
  const body: Schemas['TemplateImportRequest'] = {
    content,
    strategy,
    target_key: targetKey,
  }
  const response = await authenticatedFetch(
    buildUrl('/library/templates/import'),
    {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(body),
    }
  )
  return handleResponse<TemplateImportResponse>(response, '导入模板失败')
}

// ============================================================================
// 用户管理（v3.5）
// ============================================================================

export interface AdminUser {
  id: string
  username: string
  email: string | null
  phone_masked: string | null
  has_phone: boolean
  avatar: string | null
  role: string
  plan: string
  created_at: string | null
  last_login_at: string | null
}

export interface AdminResetPasswordResponse {
  message: string
  generated: boolean
  /** 随机模式下仅此一次返回明文 */
  password?: string
}

export type AdminCreateUserResponse = AdminUser & { generated_password?: string }

export async function createAdminUser(request: AdminCreateUserRequest): Promise<AdminCreateUserResponse> {
  const response = await authenticatedFetch(buildUrl('/admin/users'), {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(request),
  })
  return handleResponse<AdminCreateUserResponse>(response, '创建用户失败')
}

export async function listAdminUsers(): Promise<AdminUser[]> {
  const response = await authenticatedFetch(buildUrl('/admin/users'), {
    method: 'GET',
    headers: getHeaders(),
  })
  return handleResponse<AdminUser[]>(response, '获取用户列表失败')
}

export async function revealUserPhone(userId: string): Promise<string> {
  const response = await authenticatedFetch(buildUrl(`/admin/users/${userId}/phone`), {
    method: 'GET',
    headers: getHeaders(),
  })
  const data = await handleResponse<{ phone_number: string }>(response, '获取手机号失败')
  return data.phone_number
}

export async function updateAdminUser(
  userId: string,
  request: AdminUserUpdateRequest
): Promise<AdminUser> {
  const response = await authenticatedFetch(buildUrl(`/admin/users/${userId}`), {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify(request),
  })
  return handleResponse<AdminUser>(response, '更新用户失败')
}

export async function deleteAdminUser(
  userId: string
): Promise<{ message: string; deleted_threads: number }> {
  const response = await authenticatedFetch(buildUrl(`/admin/users/${userId}`), {
    method: 'DELETE',
    headers: getHeaders(),
  })
  return handleResponse<{ message: string; deleted_threads: number }>(response, '删除用户失败')
}

export async function resetAdminUserPassword(
  userId: string,
  request: AdminResetPasswordRequest
): Promise<AdminResetPasswordResponse> {
  const response = await authenticatedFetch(buildUrl(`/admin/users/${userId}/reset-password`), {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(request),
  })
  return handleResponse<AdminResetPasswordResponse>(response, '重置密码失败')
}


export interface AuditLogEntry {
  id: number
  actor_username: string
  action: string
  target: string | null
  detail: Record<string, unknown> | null
  created_at: string | null
}

export interface PaginatedAuditLogs {
  items: AuditLogEntry[]
  total: number
  limit: number
  offset: number
}

// ============================================================================
// REST 契约锚点（范式沿 types/stats.ts；SystemExpert/AdminUser/AuditLogEntry/
// ToolInfo/ToolsListResponse/ToolPolicyListResponse 六个恒有键形状已锚定）
// ============================================================================

/** 双向相等：手写类型与后端生成类型**逐字段一致**（含可选性与 null）。 */
type SameShape<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type Assert<T extends true> = T

type _SystemExpert = Assert<SameShape<SystemExpert, Schemas['ExpertResponse']>>
type _AdminUser = Assert<SameShape<AdminUser, Schemas['AdminUserResponse']>>
type _AuditLogEntry = Assert<SameShape<AuditLogEntry, Schemas['AuditLogResponse']>>
type _PaginatedAuditLogs = Assert<
  SameShape<PaginatedAuditLogs, Schemas['PaginatedAuditLogResponse']>
>
type _ToolInfo = Assert<SameShape<ToolInfo, Schemas['ToolInfo']>>
type _ToolsListResponse = Assert<SameShape<ToolsListResponse, Schemas['ToolsListResponse']>>
type _ExpertPreviewResponse = Assert<
  SameShape<PreviewExpertResponse, Schemas['ExpertPreviewResponse']>
>
type _GenerateDescriptionResponse = Assert<
  SameShape<GenerateDescriptionResponse, Schemas['GenerateDescriptionResponse']>
>

/** 锚点只做编译期校验，导出以免被 noUnusedLocals 误报 */
export type AdminConformanceAnchors = [
  _SystemExpert,
  _AdminUser,
  _AuditLogEntry,
  _PaginatedAuditLogs,
  _ToolInfo,
  _ToolsListResponse,
  _ExpertPreviewResponse,
  _GenerateDescriptionResponse,
]

export async function getAuditLogs(params: {
  search?: string
  limit?: number
  offset?: number
}): Promise<PaginatedAuditLogs> {
  const query = new URLSearchParams()
  query.set('limit', String(params.limit ?? 50))
  query.set('offset', String(params.offset ?? 0))
  if (params.search?.trim()) query.set('search', params.search.trim())
  const response = await authenticatedFetch(buildUrl(`/admin/audit-logs?${query.toString()}`))
  return handleResponse<PaginatedAuditLogs>(response, '获取审计日志失败')
}
