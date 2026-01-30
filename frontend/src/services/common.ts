/**
 * 通用 API 工具函数
 */

// 从环境变量读取 API 基础 URL
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

import { logger } from '@/utils/logger'
import { generateUUID } from '@/utils'

/**
 * 获取或生成客户端ID
 */
export function getClientId(): string {
  const STORAGE_KEY = 'xpouch_client_id'
  let clientId = localStorage.getItem(STORAGE_KEY)
  if (!clientId) {
    // 使用统一的 UUID 生成函数
    clientId = generateUUID()
    localStorage.setItem(STORAGE_KEY, clientId)
  }
  return clientId
}

/**
 * 统一请求头（优先使用 JWT，回退到 X-User-ID）
 */
export function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  // 优先使用 JWT token（从 Zustand persist 读取）
  const storageData = localStorage.getItem('xpouch-user-storage')
  if (storageData) {
    try {
      const parsed = JSON.parse(storageData)
      const accessToken = parsed.state?.accessToken
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`
        return headers
      }
    } catch (e) {
      logger.warn('[API Headers] 解析 token 失败:', e)
    }
  }

  // 回退到 X-User-ID（向后兼容）
  headers['X-User-ID'] = getClientId()
  return headers
}

/**
 * 统一 URL 构建
 */
export function buildUrl(path: string): string {
  return `${API_BASE_URL}${path.startsWith('/') ? path : '/' + path}`
}

/**
 * 统一错误处理
 */
export async function handleResponse<T>(response: Response, errorMessage: string): Promise<T> {
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || errorMessage)
  }
  return response.json()
}
