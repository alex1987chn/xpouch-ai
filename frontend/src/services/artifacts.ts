/**
 * 产物中心 API 服务
 */

import { authenticatedFetch, buildUrl, handleResponse } from './common'
import type { ArtifactListItem, PaginatedArtifacts } from '@/types'

/**
 * 跨会话产物列表（分页 + 类型/会话过滤；列表只带内容预览）
 */
export async function listArtifacts(params: {
  page?: number
  limit?: number
  type?: string
  threadId?: string
}): Promise<PaginatedArtifacts> {
  const query = new URLSearchParams()
  if (params.page) query.set('page', String(params.page))
  if (params.limit) query.set('limit', String(params.limit))
  if (params.type) query.set('type', params.type)
  if (params.threadId) query.set('thread_id', params.threadId)

  const url = buildUrl(`/artifacts?${query.toString()}`)
  const response = await authenticatedFetch(url)
  return handleResponse<PaginatedArtifacts>(response, '获取产物列表失败')
}

/**
 * 产物详情（完整内容）
 */
export async function getArtifactDetail(artifactId: string): Promise<ArtifactListItem> {
  const url = buildUrl(`/artifacts/${artifactId}?full=true`)
  const response = await authenticatedFetch(url)
  return handleResponse<ArtifactListItem>(response, '获取产物详情失败')
}
