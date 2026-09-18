/**
 * 统计 API 服务
 */

import { authenticatedFetch, buildUrl, handleResponse } from './common'
import type { components } from '@/types/api.generated'
import type { RunStatsResponse } from '@/types/stats'

/**
 * 获取运行统计
 */
export async function getRunStats(
  limit: number = 50,
  offset: number = 0,
  days: number = 7,
  search?: string
): Promise<RunStatsResponse> {
  const searchParam = search?.trim() ? `&search=${encodeURIComponent(search.trim())}` : ''
  const url = buildUrl(`/admin/stats/runs?limit=${limit}&offset=${offset}&days=${days}${searchParam}`)
  const response = await authenticatedFetch(url)
  return handleResponse<RunStatsResponse>(response, '获取运行统计失败')
}


export interface TokensToday {
  today_tokens: number
  daily_token_quota: number | null
}

// ============================================================================
// REST 契约锚点（范式沿 types/events.ts 的 SameShape）
//
// 真相源是后端路由的 response_model（→ api.generated.ts）；手写类型若与
// 生成物漂移（改字段/改类型/丢 null），下面的编译期断言立刻红。
// mcp.ts 等其余手写类型的锚点迁移见 T2 记账（transport/connection_status
// 的字面量收窄需后端 Literal 化配合，属后续批次）。
// ============================================================================

/** 双向相等：手写类型与后端生成类型**逐字段一致**（含可选性与 null）。 */
type SameShape<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type Assert<T extends true> = T

type _TokensToday = Assert<SameShape<TokensToday, components['schemas']['TokensTodayResponse']>>

/** 上面这组断言只做编译期校验，导出以免被 noUnusedLocals 误报 */
export type ApiConformanceAnchors = [_TokensToday]

/** 当前用户今日 token 用量 + 全局配额（底栏轻量接口；null 配额 = 不限量） */
export async function getTokensToday(): Promise<TokensToday> {
  const response = await authenticatedFetch(buildUrl('/admin/stats/tokens-today'))
  return handleResponse<TokensToday>(response, '获取今日用量失败')
}
