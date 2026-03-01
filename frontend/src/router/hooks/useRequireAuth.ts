/**
 * 路由认证守卫 Hook
 * 
 * 用于需要登录才能访问的页面
 */

import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUserStore } from '@/store/userStore'
import { useApp } from '@/providers/AppProvider'

export function useRequireAuth(): boolean {
  const navigate = useNavigate()
  const isAuthenticated = useUserStore(state => state.isAuthenticated)
  const { dialogs: { openLogin } } = useApp()

  useEffect(() => {
    if (!isAuthenticated) {
      openLogin()
      navigate('/', { replace: true })
    }
  }, [isAuthenticated, navigate, openLogin])

  return isAuthenticated
}
