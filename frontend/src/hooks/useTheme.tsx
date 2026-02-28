/**
 * ============================================
 * useTheme Hook - 主题管理
 * ============================================
 * 
 * 兼容层：将旧的 useTheme API 映射到新的 themeStore
 * 支持 4 个主题：light / dark / bauhaus / cyberpunk
 * 
 * 使用方式：
 * const { theme, setTheme, toggleTheme } = useTheme()
 */

import { useEffect } from 'react'
import { useThemeStore, type Theme } from '@/store/themeStore'

interface UseThemeReturn {
  theme: Theme
  toggleTheme: () => void
  setTheme: (theme: Theme) => void
}

/**
 * 主题 Hook - 兼容旧 API
 * 内部使用新的 themeStore
 */
export function useTheme(): UseThemeReturn {
  const { theme, setTheme, toggleTheme } = useThemeStore()
  
  return {
    theme,
    setTheme,
    toggleTheme
  }
}

/**
 * 主题初始化组件
 * 在应用启动时初始化主题
 */
export function ThemeInitializer() {
  useEffect(() => {
    // 初始化主题（应用 persisted 的主题设置）
    useThemeStore.getState().initTheme()
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
