/**
 * 用量汇总 API 服务（B5 token 记账可视化）
 */

import { authenticatedFetch, buildUrl, handleResponse } from './common'

export interface UsageBucket {
  runs: number
  total_tokens: number
  prompt_tokens: number
  completion_tokens: number
}

export interface UsageSummary {
  today: UsageBucket
  total: UsageBucket
}

/** 当前用户 token 用量汇总（今日 / 累计） */
export async function getUsageSummary(): Promise<UsageSummary> {
  const response = await authenticatedFetch(buildUrl('/usage/summary'))
  return handleResponse<UsageSummary>(response, '获取用量失败')
}
