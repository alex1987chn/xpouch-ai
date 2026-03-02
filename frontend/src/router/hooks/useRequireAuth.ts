/**
 * 路由认证守卫 Hook
 * 
 * 用于需要登录才能访问的页面
 * P0-6 修复: 等待认证检查完成后再判断是否跳转
 */

import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUserStore } from '@/store/userStore'
import { useApp } from '@/providers/AppProvider'

export function useRequireAuth(): boolean {
  const navigate = useNavigate()
  const isAuthenticated = useUserStore(state => state.isAuthenticated)
  const isAuthChecked = useUserStore(state => state.isAuthChecked)
  const { dialogs: { openLogin } } = useApp()

  useEffect(() => {
    // P0-6 修复: 只有认证检查完成后才判断是否跳转
    if (isAuthChecked && !isAuthenticated) {
      openLogin()
      navigate('/', { replace: true })
    }
  }, [isAuthenticated, isAuthChecked, navigate, openLogin])

  // P0-6 修复: 认证检查完成前返回 false，让页面显示 loading
  if (!isAuthChecked) {
    return false
  }

  return isAuthenticated
}
