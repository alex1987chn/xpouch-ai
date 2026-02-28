/**
 * ============================================
 * Theme Store - 主题状态管理
 * ============================================
 * 
 * 功能：
 * 1. 主题切换（light/dark/bauhaus/cyberpunk）
 * 2. 主题持久化（localStorage）
 * 3. 系统主题监听（prefers-color-scheme）
 * 4. 主题切换动画过渡
 * 
 * 使用方式：
 * const { theme, setTheme, toggleTheme } = useThemeStore()
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** 支持的主题类型 */
export type Theme = 'light' | 'dark' | 'bauhaus' | 'cyberpunk'

/** 主题配置元数据 */
export interface ThemeMeta {
  id: Theme
  name: string
  description: string
  icon: string
}

/** 所有可用主题 */
export const THEMES: ThemeMeta[] = [
  {
    id: 'bauhaus',
    name: 'Bauhaus',
    description: '包豪斯工业风 - 粗边框、硬阴影',
    icon: 'Square'
  },
  {
    id: 'light',
    name: 'Light',
    description: '明亮主题 - 清晰易读',
    icon: 'Sun'
  },
  {
    id: 'dark',
    name: 'Dark',
    description: '暗黑主题 - 夜间护眼',
    icon: 'Moon'
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk',
    description: '赛博朋克 - 霓虹发光',
    icon: 'Zap'
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
  
  /** 切换到下一下主题 */
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
    
    // 同时更新 color-scheme（影响浏览器默认样式，如滚动条）
    const colorScheme = theme === 'dark' || theme === 'cyberpunk' ? 'dark' : 'light'
    document.documentElement.style.colorScheme = colorScheme
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
      // 默认值
      theme: 'bauhaus',
      followSystem: false,

      /**
       * 设置主题
       */
      setTheme: (theme: Theme) => {
        console.log('[ThemeStore] setTheme 被调用:', theme)
        applyTheme(theme)
        set({ theme, followSystem: false })
        console.log('[ThemeStore] data-theme 已设置为:', document.documentElement.getAttribute('data-theme'))
        
        // 可选：添加切换动画类
        if (typeof document !== 'undefined') {
          document.documentElement.classList.add('theme-transitioning')
          setTimeout(() => {
            document.documentElement.classList.remove('theme-transitioning')
          }, 300)
        }
      },

      /**
       * 切换主题（循环切换）
       */
      toggleTheme: () => {
        const themes: Theme[] = ['bauhaus', 'light', 'dark', 'cyberpunk']
        const currentIndex = themes.indexOf(get().theme)
        const nextIndex = (currentIndex + 1) % themes.length
        const nextTheme = themes[nextIndex]
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
        const state = get()
        const { theme, followSystem } = state
        
        console.log('[ThemeStore] initTheme 被调用, 当前主题:', theme, 'followSystem:', followSystem)
        
        if (followSystem) {
          const systemTheme = getSystemTheme()
          applyTheme(systemTheme)
          set({ theme: systemTheme })
          console.log('[ThemeStore] 已应用系统主题:', systemTheme)
        } else {
          applyTheme(theme)
          console.log('[ThemeStore] 已应用主题:', theme)
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
 * 需要在 useEffect 中调用，避免 SSR 问题
 * 
 * 使用示例：
 * function App() {
 *   useEffect(() => {
 *     useThemeStore.getState().initTheme()
 *   }, [])
 *   return <AppContent />
 * }
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
