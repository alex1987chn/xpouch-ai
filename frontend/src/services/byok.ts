/**
 * BYOK（用户自带 API Key）API service
 *
 * 明文只在 upsert 请求出现一次；列表/管理台视图只带掩码元信息。
 */

import { authenticatedFetch, buildUrl, handleResponse } from './common'

export interface ApiKeyMeta {
  provider: string
  key_hint: string
  updated_at: string
}

export interface ApiKeyListResponse {
  enabled: boolean
  items: ApiKeyMeta[]
}

export interface ApiKeyTestResponse {
  ok: boolean
  detail: string
}

export async function listMyApiKeys(): Promise<ApiKeyListResponse> {
  const response = await authenticatedFetch(buildUrl('/user/api-keys'))
  return handleResponse<ApiKeyListResponse>(response, '获取 API Keys 失败')
}

export async function upsertMyApiKey(provider: string, apiKey: string): Promise<ApiKeyMeta> {
  const response = await authenticatedFetch(buildUrl('/user/api-keys'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, api_key: apiKey }),
  })
  return handleResponse<ApiKeyMeta>(response, '保存 API Key 失败')
}

export async function deleteMyApiKey(provider: string): Promise<void> {
  const response = await authenticatedFetch(buildUrl(`/user/api-keys/${encodeURIComponent(provider)}`), {
    method: 'DELETE',
  })
  if (!response.ok && response.status !== 204) {
    await handleResponse(response, '删除 API Key 失败')
  }
}

export async function testMyApiKey(provider: string): Promise<ApiKeyTestResponse> {
  const response = await authenticatedFetch(
    buildUrl(`/user/api-keys/${encodeURIComponent(provider)}/test`),
    { method: 'POST' },
  )
  return handleResponse<ApiKeyTestResponse>(response, '测试连接失败')
}
