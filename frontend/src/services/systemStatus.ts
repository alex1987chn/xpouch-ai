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
  /** 同层任务并发上限：configured=设置表值（null=未配置，走 env），effective=实际生效值 */
  graph_max_concurrency: {
    configured: number | null
    effective: number
    env_default: number
    limit: number
  }
}

export async function getSystemStatus(): Promise<SystemStatus> {
  const response = await authenticatedFetch(buildUrl('/admin/system-status'))
  return handleResponse<SystemStatus>(response, '获取系统状态失败')
}

export async function updateDailyTokenQuota(quota: number | null): Promise<{ user_daily_token_quota: number | null }> {
  const response = await authenticatedFetch(buildUrl('/admin/user-daily-token-quota'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ daily_token_quota: quota } satisfies import('@/types/api.generated').components['schemas']['DailyTokenQuotaRequest']),
  })
  return handleResponse(response, '更新配额失败')
}

export async function updateGraphMaxConcurrency(
  value: number | null
): Promise<{ graph_max_concurrency: number }> {
  const response = await authenticatedFetch(buildUrl('/admin/graph-max-concurrency'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ graph_max_concurrency: value } satisfies import('@/types/api.generated').components['schemas']['GraphConcurrencyRequest']),
  })
  return handleResponse(response, '更新并发上限失败')
}
