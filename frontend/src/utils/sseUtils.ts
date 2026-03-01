/**
 * SSE (Server-Sent Events) 工具函数
 * 提供流式响应处理的通用逻辑
 */

import { logger } from '@/utils/logger'

/**
 * SSE 心跳超时时间（毫秒）
 * 超过此时间无活动视为连接断开
 */
export const SSE_HEARTBEAT_TIMEOUT = 45000 // 45秒（后端心跳间隔 15秒的 3 倍）

/**
 * SSE 心跳检测间隔（毫秒）
 */
export const SSE_HEARTBEAT_CHECK_INTERVAL = 10000 // 10秒检查一次

/**
 * SSE Promise 处理工具
 * 
 * 用于处理 SSE 流式响应的通用逻辑，包括：
 * - 心跳检测和超时处理
 * - 安全的 resolve/reject 包装
 * - 资源清理
 * 
 * 使用示例：
 * ```typescript
 * const { cleanup, safeResolve, safeReject, startHeartbeat, updateActivity } = createSSEPromiseHelpers({
 *   timeout: SSE_HEARTBEAT_TIMEOUT,
 *   checkInterval: SSE_HEARTBEAT_CHECK_INTERVAL,
 *   onTimeout: () => controller.abort(),
 *   context: 'sendMessage'
 * })
 * 
 * startHeartbeat()
 * 
 * // 在收到数据时更新活动时间
 * updateActivity()
 * 
 * // 完成时安全 resolve
 * safeResolve(result)
 * 
 * // 出错时安全 reject
 * safeReject(error)
 * ```
 */
export interface SSEPromiseHelpersOptions {
  /** 超时时间（毫秒） */
  timeout?: number
  /** 检测间隔（毫秒） */
  checkInterval?: number
  /** 超时回调 */
  onTimeout: () => void
  /** 上下文标识（用于日志） */
  context?: string
}

export interface SSEPromiseHelpers {
  /** 清理函数：清除心跳定时器 */
  cleanup: () => void
  /** 安全 resolve：确保只执行一次并清理资源 */
  safeResolve: <T>(value: T) => void
  /** 安全 reject：确保只执行一次并清理资源 */
  safeReject: (error: Error) => void
  /** 启动心跳检测 */
  startHeartbeat: () => void
  /** 更新活动时间（防止超时） */
  updateActivity: () => void
  /** 获取当前 isCompleted 状态 */
  getIsCompleted: () => boolean
}

export function createSSEPromiseHelpers<T>(
  resolve: (value: T) => void,
  reject: (error: Error) => void,
  options: SSEPromiseHelpersOptions
): SSEPromiseHelpers {
  const { timeout = SSE_HEARTBEAT_TIMEOUT, checkInterval = SSE_HEARTBEAT_CHECK_INTERVAL, onTimeout, context = 'SSE' } = options
  
  let isCompleted = false
  let lastActivityTime = Date.now()
  let heartbeatCheck: NodeJS.Timeout | null = null
  
  const cleanup = () => {
    if (heartbeatCheck) {
      clearInterval(heartbeatCheck)
      heartbeatCheck = null
    }
  }
  
  const safeResolve = (value: T) => {
    cleanup()
    if (!isCompleted) {
      isCompleted = true
      resolve(value)
    }
  }
  
  const safeReject = (error: Error) => {
    cleanup()
    if (!isCompleted) {
      isCompleted = true
      reject(error)
    }
  }
  
  const updateActivity = () => {
    lastActivityTime = Date.now()
  }
  
  const startHeartbeat = () => {
    heartbeatCheck = setInterval(() => {
      if (isCompleted) {
        cleanup()
        return
      }
      const elapsed = Date.now() - lastActivityTime
      if (elapsed > timeout) {
        logger.warn(`[${context}] SSE 心跳超时，连接可能已断开`)
        onTimeout()
        safeReject(new Error('连接超时，请重试'))
      }
    }, checkInterval)
  }
  
  const getIsCompleted = () => isCompleted
  
  return {
    cleanup,
    safeResolve,
    safeReject,
    startHeartbeat,
    updateActivity,
    getIsCompleted
  }
}
