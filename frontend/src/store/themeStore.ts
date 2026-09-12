/**
 * ============================================
 * Theme Store - 主题状态管理
 * ============================================
 *
 * 功能：
 * 1. 主题切换（soft/dark）- 柔和为默认
 * 2. 主题持久化（localStorage）
 * 3. 系统主题监听（prefers-color-scheme）
 * 4. 主题切换动画过渡
 *
 * 使用方式：
 * const { theme, setTheme, toggleTheme } = useThemeStore()
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { logger } from '@/utils/logger'
import { applyThemeWithTransition } from '@/lib/themeTransition'

/** 支持的主题类型 - 柔和（默认）/ 暖暗 */
export type Theme = 'soft' | 'dark'

/** 主题配置元数据 */
export interface ThemeMeta {
  id: Theme
  name: string
  description: string
  icon: string
}

/** 可用主题 - 柔和 + 暖暗 */
export const THEMES: ThemeMeta[] = [
  {
    id: 'soft',
    name: 'Soft',
    description: '柔和亮色 - 暖中性、漫射阴影、细边框',
    icon: 'Sun'
  },
  {
    id: 'dark',
    name: 'Dark',
    description: '暖暗色 - 暖炭黑基底，夜间护眼',
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
  setTheme: (theme: Theme, origin?: { x: number; y: number }) => void

  /** 切换到下一主题 */
  toggleTheme: () => void

  /** 设置是否跟随系统 */
  setFollowSystem: (follow: boolean) => void

  /** 初始化主题（应用启动时调用） */
  initTheme: () => void

  /** @internal 获取下一个主题 */
  _getNextTheme: () => Theme

  /** @internal 迁移旧主题 */
  _migrateTheme: () => void
}

/**
 * 应用主题到 DOM
 * 通过 data-theme 属性控制 CSS 变量
 */
function applyTheme(theme: Theme): void {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme)

    // 生态兼容：本项目样式全走 data-theme + 语义 token，
    // .dark 类仅供依赖 Tailwind dark: 变体约定的第三方组件使用
    document.documentElement.classList.toggle('dark', theme === 'dark')

    // 更新 color-scheme
    document.documentElement.style.colorScheme = theme === 'dark' ? 'dark' : 'light'
  }
}

/**
 * 获取系统偏好主题
 */
function getSystemTheme(): Theme {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'soft'
  }
  return 'soft'
}

let mediaQueryList: MediaQueryList | null = null
let mediaQueryListener: ((event: MediaQueryListEvent) => void) | null = null

function ensureSystemThemeListener(setThemeFromSystem: (theme: Theme) => void, shouldFollowSystem: () => boolean): void {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return
  }

  if (mediaQueryList && mediaQueryListener) {
    return
  }

  mediaQueryList = window.matchMedia('(prefers-color-scheme: dark)')
  mediaQueryListener = (event: MediaQueryListEvent) => {
    if (!shouldFollowSystem()) {
      return
    }

    const newTheme: Theme = event.matches ? 'dark' : 'soft'
    applyTheme(newTheme)
    setThemeFromSystem(newTheme)
  }

  mediaQueryList.addEventListener('change', mediaQueryListener)
}

/**
 * 主题状态管理 Store
 */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      // 默认：柔和亮主题
      theme: 'soft',
      followSystem: false,

      /**
       * 修复旧主题值（迁移逻辑）
       * 2026-09-12 bauhaus 主题移除：bauhaus → soft；
       * 历史遗留 light/kyoto/cyberpunk/glass → soft
       */
      _migrateTheme: () => {
        const currentTheme = get().theme as string
        const validThemes: Theme[] = ['soft', 'dark']
        if (!validThemes.includes(currentTheme as Theme)) {
          const newTheme: Theme = 'soft'
          applyTheme(newTheme)
          set({ theme: newTheme })
          logger.info('[ThemeStore] 已迁移旧主题:', currentTheme, '->', newTheme)
        }
      },

      /**
       * 获取下一个主题（用于循环切换）
       * Soft -> Dark -> Soft
       */
      _getNextTheme: (): Theme => {
        const currentTheme = get().theme
        const themeOrder: Theme[] = ['soft', 'dark']
        const currentIndex = themeOrder.indexOf(currentTheme)
        const nextIndex = (currentIndex + 1) % themeOrder.length
        return themeOrder[nextIndex]
      },

      /**
       * 设置主题（用户主动切换）
       * origin：切换控件在视口中的位置——View Transitions 光圈从那里点亮/熄灭；
       * 不传则从屏幕中心扩散。动画策略见 lib/themeTransition（A 渐变兜底 + B 光圈）。
       */
      setTheme: (theme: Theme, origin?: { x: number; y: number }) => {
        applyThemeWithTransition(() => applyTheme(theme), origin)
        set({ theme, followSystem: false })
      },

      /**
       * 切换主题（Soft -> Dark -> Soft）
       */
      toggleTheme: () => {
        const nextTheme = get()._getNextTheme()
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

        ensureSystemThemeListener(
          (newTheme) => set({ theme: newTheme }),
          () => get().followSystem
        )
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
