/**
 * 通用 API 工具函数
 * 
 * P0 修复: 添加 credentials: 'include' 以支持 HttpOnly Cookie
 * P1 增强: 添加自动 Token 刷新机制 (拦截器模式)
 */

// 从环境变量读取 API 基础 URL
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

import { logger } from '@/utils/logger'
import { generateUUID } from '@/utils'

// ============================================================================
// P1 增强: Token 刷新状态管理
// ============================================================================

/** 是否正在刷新 Token */
let isRefreshing = false

/** 等待刷新完成的请求队列 */
let pendingRequests: Array<{
  resolve: (value: Response) => void
  reject: (reason: Error) => void
  url: string
  options: RequestInit
}> = []

/** 最大重试次数 */
const MAX_RETRY_COUNT = 1

/** 请求重试计数器 (用于避免无限循环) */
const retryCountMap = new WeakMap<RequestInit, number>()

/**
 * 显示登录弹窗
 */
function showLoginDialog(): void {
  // 动态导入以避免循环依赖
  import('@/store/taskStore').then(({ useTaskStore }) => {
    useTaskStore.getState().setLoginDialogOpen(true)
  }).catch(err => {
    logger.error('[Auth] 无法显示登录弹窗:', err)
  })
}

/**
 * 执行 Token 刷新
 * 使用 Promise 确保并发请求只触发一次刷新
 */
async function doRefreshToken(): Promise<boolean> {
  try {
    logger.info('[Auth] 正在刷新 Token...')
    
    const response = await fetch(buildUrl('/auth/refresh-token'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    })
    
    if (response.ok) {
      logger.info('[Auth] Token 刷新成功')
      return true
    } else {
      logger.warn('[Auth] Token 刷新失败:', response.status)
      return false
    }
  } catch (error) {
    logger.error('[Auth] Token 刷新请求失败:', error)
    return false
  }
}

/**
 * 处理 Token 刷新逻辑
 * 确保同时只有一个刷新请求，其他请求排队等待
 */
async function handleTokenRefresh(): Promise<boolean> {
  // 如果已经在刷新，等待刷新完成
  if (isRefreshing) {
    logger.debug('[Auth] Token 刷新进行中，等待...')
    return new Promise((resolve) => {
      const checkRefresh = setInterval(() => {
        if (!isRefreshing) {
          clearInterval(checkRefresh)
          // 刷新完成后，假设成功了（如果失败，isRefreshing 也会被重置）
          resolve(true)
        }
      }, 100)
      // 10 秒超时
      setTimeout(() => {
        clearInterval(checkRefresh)
        resolve(false)
      }, 10000)
    })
  }

  // 开始刷新
  isRefreshing = true
  
  try {
    const success = await doRefreshToken()
    
    // 刷新完成，处理等待队列
    isRefreshing = false
    
    if (success) {
      // 刷新成功，重试所有等待的请求
      logger.debug(`[Auth] 重试 ${pendingRequests.length} 个等待的请求`)
      pendingRequests.forEach(({ resolve, reject, url, options }) => {
        // 增加重试计数
        const currentRetry = retryCountMap.get(options) || 0
        if (currentRetry >= MAX_RETRY_COUNT) {
          reject(new Error('请求重试次数超过上限') as Error & { status: number })
          return
        }
        retryCountMap.set(options, currentRetry + 1)
        
        // 重试请求
        authenticatedFetch(url, options)
          .then(resolve)
          .catch(reject)
      })
    } else {
      // 刷新失败，拒绝所有等待的请求
      logger.warn('[Auth] Token 刷新失败，拒绝所有等待的请求')
      pendingRequests.forEach(({ reject }) => {
        const error = new Error('登录已过期，请重新登录') as Error & { status: number }
        error.status = 401
        reject(error)
      })
      // 显示登录弹窗
      showLoginDialog()
    }
    
    pendingRequests = []
    return success
  } catch (error) {
    isRefreshing = false
    pendingRequests = []
    return false
  }
}

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
 * P0 修复: 统一请求头
 * 
 * 注意: JWT Token 现在通过 HttpOnly Cookie 自动发送，
 * 不需要再手动设置 Authorization 头。
 * 保留 X-User-ID 用于开发环境回退。
 */
export function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  // P0 修复: 不再从 localStorage 读取 Token
  // Cookie 会自动随请求发送
  
  // 开发环境回退到 X-User-ID
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
 * P1 增强: 带认证的 fetch 包装
 * 
 * 特性:
 * 1. 自动添加 credentials: 'include' 以携带 HttpOnly Cookie
 * 2. 401 时自动触发 Token 刷新
 * 3. 刷新成功后自动重试原请求
 * 4. 刷新失败时弹出登录框
 */
export async function authenticatedFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  // 发送请求
  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      ...getHeaders(),
      ...(options.headers || {})
    }
  })

  // P1 增强: 处理 401 错误，尝试自动刷新 Token
  if (response.status === 401) {
    // 检查是否是刷新 token 接口本身的 401（避免无限循环）
    if (url.includes('/auth/refresh-token')) {
      logger.warn('[Auth] 刷新 Token 接口返回 401，需要重新登录')
      showLoginDialog()
      throw Object.assign(new Error('登录已过期，请重新登录'), { status: 401 })
    }

    // 检查重试次数
    const currentRetry = retryCountMap.get(options) || 0
    if (currentRetry >= MAX_RETRY_COUNT) {
      logger.warn('[Auth] 请求重试次数超过上限，弹出登录框')
      showLoginDialog()
      throw Object.assign(new Error('登录已过期，请重新登录'), { status: 401 })
    }

    logger.info('[Auth] 收到 401，尝试自动刷新 Token...')

    // 将当前请求加入等待队列
    const retryPromise = new Promise<Response>((resolve, reject) => {
      pendingRequests.push({ resolve, reject, url, options })
    })

    // 触发刷新
    const refreshSuccess = await handleTokenRefresh()
    
    if (refreshSuccess) {
      // 等待重试完成并返回结果
      return retryPromise
    } else {
      // 刷新失败，抛出错误
      throw Object.assign(new Error('登录已过期，请重新登录'), { status: 401 })
    }
  }

  return response
}

/**
 * P1 增强: 统一错误处理
 * 
 * 401 错误现在由 authenticatedFetch 自动处理，
 * 这里只需要处理其他错误。
 */
export async function handleResponse<T>(response: Response, errorMessage: string): Promise<T> {
  if (!response.ok) {
    let errorDetail = errorMessage
    try {
      const errorData = await response.json()
      errorDetail = errorData.detail || errorMessage
    } catch {
      // 无法解析错误响应，使用默认消息
    }
    
    const error = new Error(errorDetail) as Error & { status: number }
    error.status = response.status
    throw error
  }
  
  // 204 No Content 或空响应体，返回 undefined
  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return undefined as T
  }
  
  return response.json()
}

/**
 * 统一 SSE 连接错误处理
 * 用于 fetchEventSource 的 onopen 回调
 * 
 * P1 注意: SSE 请求不自动刷新 Token，因为 SSE 是长连接
 * 如果 SSE 返回 401，需要用户手动刷新页面或重新登录
 */
export function handleSSEConnectionError(
  response: Response,
  context: string,
  cleanup?: () => void
): void {
  if (!response.ok) {
    logger.error(`[${context}] SSE 连接失败:`, response.status, response.statusText)
    
    // SSE 401 时显示登录弹窗
    if (response.status === 401) {
      showLoginDialog()
    }
    
    cleanup?.()
    const error = new Error(`API Error: ${response.status}`) as Error & { status: number }
    error.status = response.status
    throw error
  }
  logger.debug(`[${context}] SSE 连接已打开`)
}
