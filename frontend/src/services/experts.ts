/**
 * 专家名册 API（只读）。
 *
 * 只回 `expert_key` + `name`：显示名是管理员在控制台可改的（`systemexpert.name`），
 * 这里拿到的就是权威值，前端不必再维护一份会漂移的映射。
 */

import { authenticatedFetch, buildUrl, handleResponse } from './common'

export interface ExpertCatalogItem {
  expert_key: string
  name: string
}

export async function getExpertCatalog(): Promise<ExpertCatalogItem[]> {
  const response = await authenticatedFetch(buildUrl('/experts/catalog'))
  return handleResponse<ExpertCatalogItem[]>(response, '获取专家名册失败')
}
