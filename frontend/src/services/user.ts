/**
 * 用户相关 API 服务
 * 
 * P0 修复: 添加 credentials: 'include' 以支持 HttpOnly Cookie
 */

import { getHeaders, buildUrl, handleResponse, authenticatedFetch } from './common'
import type { UserProfile } from '@/types'

// 重新导出类型供外部使用
export type { UserProfile }

// ============================================================================
// API 函数
// ============================================================================

/**
 * 获取用户资料
 */
export async function getUserProfile(): Promise<UserProfile> {
  const response = await authenticatedFetch(buildUrl('/user/me'), {
    headers: getHeaders()
  })
  return handleResponse<UserProfile>(response, '获取用户资料失败')
}

/**
 * 更新用户资料
 */
export async function updateUserProfile(
  data: Partial<UserProfile>
): Promise<UserProfile> {
  const response = await authenticatedFetch(buildUrl('/user/me'), {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(data)
  })
  return handleResponse<UserProfile>(response, '更新用户资料失败')
}
