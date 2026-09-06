/**
 * ============================================
 * ThemeInitializer - 主题初始化
 * ============================================
 *
 * 主题读写直接使用 useThemeStore（zustand）；
 * 本文件只保留应用启动时的初始化组件。
 */

import { useEffect } from 'react'
import { useThemeStore } from '@/store/themeStore'
import { logger } from '@/utils/logger'

/**
 * 主题初始化组件
 * 在应用启动时初始化主题
 */
export function ThemeInitializer() {
  useEffect(() => {
    // 初始化主题（应用 persisted 的主题设置）
    const store = useThemeStore.getState()
    store.initTheme()
    
    // 调试：打印当前主题
    logger.debug('[Theme] 初始化主题:', store.theme)
    logger.debug('[Theme] data-theme 属性:', document.documentElement.getAttribute('data-theme'))
  }, [])
  
  return null
}

/**
 * 主题 Provider - 已弃用
 * 新系统不需要 Provider，直接调用 useThemeStore 即可
 * 保留此导出用于向后兼容
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // 新系统自动初始化，不需要 Provider
  return <>{children}</>
}
