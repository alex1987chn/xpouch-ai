/**
 * AuthInitializer - 认证状态初始化组件
 * 
 * P0 修复: 应用启动时自动检查认证状态
 * 
 * 因为移除了 localStorage persist，刷新页面后状态会丢失。
 * 但 Token 仍在 HttpOnly Cookie 中，所以我们需要在应用启动时
 * 调用 /api/auth/me 来验证会话并恢复用户状态。
 */
import { useEffect, useState } from 'react'
import { useUserStore } from '@/store/userStore'
import { logger } from '@/utils/logger'

interface AuthInitializerProps {
  children: React.ReactNode
}

export function AuthInitializer({ children }: AuthInitializerProps) {
  const [isChecking, setIsChecking] = useState(true)
  const checkAuth = useUserStore(state => state.checkAuth)
  const isAuthenticated = useUserStore(state => state.isAuthenticated)

  useEffect(() => {
    // 应用启动时检查认证状态
    const initAuth = async () => {
      try {
        logger.debug('[AuthInitializer] 检查认证状态...')
        await checkAuth()
        logger.debug('[AuthInitializer] 认证检查完成')
      } catch (error) {
        logger.warn('[AuthInitializer] 认证检查失败:', error)
      } finally {
        setIsChecking(false)
      }
    }

    initAuth()
  }, [checkAuth])

  // 可以在这里添加一个加载状态
  if (isChecking) {
    // 返回一个简洁的加载状态，或者 null 保持页面空白
    // 为了更好的用户体验，可以返回 children 让页面先渲染
    // 认证状态会在后台恢复
    return <>{children}</>
  }

  return <>{children}</>
}
