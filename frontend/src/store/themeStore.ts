/**
 * ============================================
 * Theme Store - 主题状态管理
 * ============================================
 * 
 * 功能：
 * 1. 主题切换（light/dark）- 基于 Bauhaus 设计风格
 * 2. 主题持久化（localStorage）
 * 3. 系统主题监听（prefers-color-scheme）
 * 4. 主题切换动画过渡
 * 
 * 使用方式：
 * const { theme, setTheme, toggleTheme } = useThemeStore()
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** 支持的主题类型 - 只有 Light 和 Dark（Bauhaus 风格） */
export type Theme = 'light' | 'dark'

/** 主题配置元数据 */
export interface ThemeMeta {
  id: Theme
  name: string
  description: string
  icon: string
}

/** 可用主题 - Bauhaus 风格的 Light 和 Dark */
export const THEMES: ThemeMeta[] = [
  {
    id: 'light',
    name: 'Light',
    description: 'Bauhaus 明亮主题 - 粗边框、硬阴影',
    icon: 'Sun'
  },
  {
    id: 'dark',
    name: 'Dark',
    description: 'Bauhaus 暗黑主题 - 夜间护眼',
    icon: 'Moon'
  }
]

/** 主题状态接口 */
interface ThemeState {
  /** 当前主题 */
  theme: Theme
  
  /** 是否跟随系统主题 */
  followSystem: boolean
  
  /** 设置主题 */
  setTheme: (theme: Theme) => void
  
  /** 切换到下一主题 */
  toggleTheme: () => void
  
  /** 设置是否跟随系统 */
  setFollowSystem: (follow: boolean) => void
  
  /** 初始化主题（应用启动时调用） */
  initTheme: () => void
}

/**
 * 应用主题到 DOM
 * 通过 data-theme 属性控制 CSS 变量
 */
function applyTheme(theme: Theme): void {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme)
    
    // 更新 color-scheme
    document.documentElement.style.colorScheme = theme === 'dark' ? 'dark' : 'light'
  }
}

/**
 * 获取系统偏好主题
 */
function getSystemTheme(): Theme {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return 'light'
}

/**
 * 主题状态管理 Store
 */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      // 默认：Bauhaus 明亮主题
      theme: 'light',
      followSystem: false,
      
      /**
       * 修复旧主题值（迁移逻辑）
       * 将 bauhaus/cyberpunk 转换为 light/dark
       */
      _migrateTheme: () => {
        const currentTheme = get().theme
        if (currentTheme === 'bauhaus' || currentTheme === 'cyberpunk') {
          const newTheme: Theme = 'light'
          applyTheme(newTheme)
          set({ theme: newTheme })
          console.log('[ThemeStore] 已迁移旧主题:', currentTheme, '->', newTheme)
        }
      },

      /**
       * 设置主题
       */
      setTheme: (theme: Theme) => {
        applyTheme(theme)
        set({ theme, followSystem: false })
        
        // 可选：添加切换动画类
        if (typeof document !== 'undefined') {
          document.documentElement.classList.add('theme-transitioning')
          setTimeout(() => {
            document.documentElement.classList.remove('theme-transitioning')
          }, 300)
        }
      },

      /**
       * 切换主题（Light <-> Dark）
       */
      toggleTheme: () => {
        const currentTheme = get().theme
        const nextTheme: Theme = currentTheme === 'light' ? 'dark' : 'light'
        get().setTheme(nextTheme)
      },

      /**
       * 设置是否跟随系统主题
       */
      setFollowSystem: (follow: boolean) => {
        set({ followSystem: follow })
        if (follow) {
          const systemTheme = getSystemTheme()
          applyTheme(systemTheme)
          set({ theme: systemTheme })
        }
      },

      /**
       * 初始化主题（应用启动时调用）
       * 从 localStorage 恢复或应用默认主题
       */
      initTheme: () => {
        // 先迁移旧主题值
        get()._migrateTheme()
        
        const state = get()
        const { theme, followSystem } = state
        
        if (followSystem) {
          const systemTheme = getSystemTheme()
          applyTheme(systemTheme)
          set({ theme: systemTheme })
        } else {
          applyTheme(theme)
        }
        
        // 监听系统主题变化（仅在 followSystem 时）
        if (typeof window !== 'undefined' && window.matchMedia) {
          const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
          mediaQuery.addEventListener('change', (e) => {
            if (get().followSystem) {
              const newTheme = e.matches ? 'dark' : 'light'
              applyTheme(newTheme)
              set({ theme: newTheme })
            }
          })
        }
      }
    }),
    {
      name: 'xpouch-theme',
      // 只持久化这些字段
      partialize: (state) => ({ 
        theme: state.theme, 
        followSystem: state.followSystem 
      })
    }
  )
)

/**
 * 初始化主题（在应用入口调用）
 */
export function initTheme(): void {
  if (typeof window !== 'undefined') {
    useThemeStore.getState().initTheme()
  }
}

/**
 * 获取当前主题的元数据
 */
export function getCurrentThemeMeta(): ThemeMeta {
  const currentTheme = useThemeStore.getState().theme
  return THEMES.find(t => t.id === currentTheme) || THEMES[0]
}
