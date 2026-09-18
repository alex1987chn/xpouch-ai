/**
 * 模型与用户偏好 API 服务
 *
 * 模型列表的单一真相源是后端 GET /api/models（来自 providers.yaml），
 * 前端不再维护硬编码模型列表。
 */

import type { components } from '@/types/api.generated'
import { authenticatedFetch, buildUrl } from './common'

// ============================================================================
// 类型定义（SameShape 锚定后端 routers/system.py 的同名契约，范式沿 types/stats.ts）
// ============================================================================

export interface AvailableModel {
  id: string
  provider: string
  provider_name: string
  model: string | null
  name: string
  context_window: number | null
  /** 是否支持思考模式开关（DeepSeek V4 系为 true） */
  thinking_toggle: boolean
  /** 是否支持视觉输入 */
  vision: boolean
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
// REST 契约锚点
// ============================================================================

/** 双向相等：手写类型与后端生成类型**逐字段一致**（含可选性与 null）。 */
type SameShape<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type Assert<T extends true> = T

type Schemas = components['schemas']
type _AvailableModel = Assert<SameShape<AvailableModel, Schemas['AvailableModel']>>
type _UserPreferences = Assert<SameShape<UserPreferences, Schemas['ModelPreferences']>>
type _UserSettings = Assert<SameShape<UserSettingsResponse, Schemas['UserSettingsResponse']>>

/** 锚点只做编译期校验，导出以免被 noUnusedLocals 误报 */
export type ModelsConformanceAnchors = [_AvailableModel, _UserPreferences, _UserSettings]

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
