/**
 * 模型与用户偏好 API 服务
 *
 * 模型列表的单一真相源是后端 GET /api/models（来自 providers.yaml），
 * 前端不再维护硬编码模型列表。
 */

import { authenticatedFetch, buildUrl } from './common'

// ============================================================================
// 类型定义
// ============================================================================

export interface AvailableModel {
  id: string
  provider: string
  provider_name: string
  model: string
  name: string
  context_window: number
  /** 是否支持思考模式开关（DeepSeek V4 系为 true） */
  thinking_toggle: boolean
}

export type ThinkingMode = 'auto' | 'enabled' | 'disabled'

export interface UserPreferences {
  /** null 表示跟随系统默认模型 */
  simple_model: string | null
  simple_thinking: ThinkingMode
}

export interface UserSettingsResponse {
  preferences: UserPreferences
  default_model: { id: string; name: string }
}

// ============================================================================
// API 函数
// ============================================================================

/** 获取当前可用的模型列表（provider 已启用） */
export async function getAvailableModels(): Promise<AvailableModel[]> {
  const response = await authenticatedFetch(buildUrl('/models'))
  if (!response.ok) {
    throw new Error(`获取模型列表失败: ${response.status}`)
  }
  const data = await response.json()
  return data.models ?? []
}

/** 获取当前用户偏好设置（含默认值合并与系统默认模型信息） */
export async function getUserSettings(): Promise<UserSettingsResponse> {
  const response = await authenticatedFetch(buildUrl('/user/settings'))
  if (!response.ok) {
    throw new Error(`获取用户设置失败: ${response.status}`)
  }
  return response.json()
}

/** 更新当前用户偏好设置 */
export async function updateUserSettings(preferences: UserPreferences): Promise<UserPreferences> {
  const response = await authenticatedFetch(buildUrl('/user/settings'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(preferences),
  })
  if (!response.ok) {
    throw new Error(`保存用户设置失败: ${response.status}`)
  }
  const data = await response.json()
  return data.preferences
}
