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

/**
 * 创建产物分享链接（返回明文 token，仅此一次）
 */
export async function shareArtifact(
  artifactId: string
): Promise<{ token: string; path: string }> {
  const url = buildUrl(`/artifacts/${artifactId}/share`)
  const response = await authenticatedFetch(url, { method: 'POST' })
  return handleResponse<{ token: string; path: string }>(response, '创建分享链接失败')
}

/**
 * 撤销产物的全部分享链接
 */
export async function revokeArtifactShare(
  artifactId: string
): Promise<{ revoked: number }> {
  const url = buildUrl(`/artifacts/${artifactId}/share`)
  const response = await authenticatedFetch(url, { method: 'DELETE' })
  return handleResponse<{ revoked: number }>(response, '撤销分享失败')
}
