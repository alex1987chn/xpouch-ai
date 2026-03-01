/**
 * 认证工具函数
 * 提供登录相关的通用功能
 */

import { logger } from '@/utils/logger'

/**
 * 显示登录弹窗
 * 
 * 动态导入 taskStore 以避免循环依赖
 * 用于在检测到 401 错误时触发登录弹窗
 */
export function showLoginDialog(): void {
  import('@/store/taskStore')
    .then(({ useTaskStore }) => {
      useTaskStore.getState().setLoginDialogOpen(true)
    })
    .catch((err) => {
      logger.error('[Auth] 无法显示登录弹窗:', err)
    })
}
