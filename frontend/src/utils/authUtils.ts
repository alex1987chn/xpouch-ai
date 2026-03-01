/**
 * 认证工具函数
 * 提供登录相关的通用功能
 */

import { logger } from '@/utils/logger'

// 全局回调函数，由 AppProvider 设置
let openLoginCallback: (() => void) | null = null

/**
 * 注册登录弹窗打开回调
 * 由 AppProvider 在初始化时调用
 */
export function registerLoginDialogCallback(callback: () => void): void {
  openLoginCallback = callback
}

/**
 * 显示登录弹窗
 * 
 * 通过全局回调触发，避免循环依赖
 * 用于在检测到 401 错误时触发登录弹窗
 */
export function showLoginDialog(): void {
  if (openLoginCallback) {
    openLoginCallback()
  } else {
    // 降级方案：触发自定义事件
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('show-login-dialog'))
    }
    logger.warn('[Auth] 登录弹窗回调未注册，使用事件降级方案')
  }
}
