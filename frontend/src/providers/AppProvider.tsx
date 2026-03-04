import { useEffect, ReactNode } from 'react'
import { registerLoginDialogCallback } from '@/utils/authUtils'
import { useAppUIStore } from '@/store/appUIStore'

/**
 * 仅负责与 store 无关的全局副作用：登录弹窗回调注册、window 事件监听。
 * 所有 UI 状态来自 useAppUIStore，页面用 useAppUISelectors() 读取。
 */
export function AppProvider({ children }: { children: ReactNode }) {
  const openLogin = useAppUIStore((s) => s.openLogin)

  useEffect(() => {
    registerLoginDialogCallback(openLogin)
  }, [openLogin])

  useEffect(() => {
    const handleShowLogin = () => openLogin()
    window.addEventListener('show-login-dialog', handleShowLogin)
    return () => window.removeEventListener('show-login-dialog', handleShowLogin)
  }, [openLogin])

  return <>{children}</>
}
