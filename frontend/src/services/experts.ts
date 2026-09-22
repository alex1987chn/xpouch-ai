/**
 * 专家名册 API（只读）。
 *
 * 只回 `expert_type` + `name`：显示名是管理员在控制台可改的（`systemexpert.name`），
 * 这里拿到的就是权威值，前端不必再维护一份会漂移的映射。
 */

import type { components } from '@/types/api.generated'
import { authenticatedFetch, buildUrl, handleResponse } from './common'

export interface ExpertCatalogItem {
  expert_type: string
  name: string
}

/** 双向相等：手写类型与后端生成类型**逐字段一致**（范式沿 types/stats.ts）。 */
type SameShape<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type Assert<T extends true> = T

type _ExpertCatalogItem = Assert<
  SameShape<ExpertCatalogItem, components['schemas']['ExpertCatalogItem']>
>

/** 锚点只做编译期校验，导出以免被 noUnusedLocals 误报 */
export type ExpertsConformanceAnchors = [_ExpertCatalogItem]

export async function getExpertCatalog(): Promise<ExpertCatalogItem[]> {
  const response = await authenticatedFetch(buildUrl('/experts/catalog'))
  return handleResponse<ExpertCatalogItem[]>(response, '获取专家名册失败')
}
