/**
 * 系统状态 API 服务（部署检查面，admin 专属）
 */

import { authenticatedFetch, buildUrl, handleResponse } from './common'

export interface SystemStatus {
  version: string
  environment: string
  database: {
    connected: boolean
    applied_version: string | null
    code_head: string | null
    up_to_date: boolean
  }
  providers: {
    configured: { name: string; display_name: string; default_model: string | null; env_key: string }[]
    missing_key: { name: string; env_key: string }[]
    disabled: string[]
    total: number
  }
  default_model: string
  users: { total: number; admin: number }
  user_daily_token_quota: number | null
}

export async function getSystemStatus(): Promise<SystemStatus> {
  const response = await authenticatedFetch(buildUrl('/admin/system-status'))
  return handleResponse<SystemStatus>(response, '获取系统状态失败')
}

export async function updateDailyTokenQuota(quota: number | null): Promise<{ user_daily_token_quota: number | null }> {
  const response = await authenticatedFetch(buildUrl('/admin/user-daily-token-quota'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ daily_token_quota: quota }),
  })
  return handleResponse(response, '更新配额失败')
}
