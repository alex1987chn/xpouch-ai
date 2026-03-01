/**
 * ============================================
 * ThemeSwitcher - 主题切换组件
 * ============================================
 * 
 * 支持 2 个主题：Light / Dark（Bauhaus 风格）
 * 点击浮动按钮展开主题选择面板
 */

import { useState, useRef, useEffect } from 'react'
import { Sun, Moon, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useThemeStore, THEMES, type Theme } from '@/store/themeStore'

interface ThemeSwitcherProps {
  className?: string
  variant?: 'floating' | 'inline' | 'dropdown'
}

/**
 * 主题图标映射
 */
const themeIcons: Record<Theme, React.ReactNode> = {
  light: <Sun className="w-4 h-4" />,
  dark: <Moon className="w-4 h-4" />,
}

/**
 * 主题预览色块（展示主题的代表色）
 */
const themePreview: Record<Theme, string> = {
  light: 'bg-yellow-400 border-2 border-content-primary',
  dark: 'bg-slate-700 border-2 border-slate-500',
}

/**
 * 浮动按钮模式（右下角）
 */
function FloatingThemeSwitcher({ className }: { className?: string }) {
  const [isOpen, setIsOpen] = useState(false)
  const { theme, setTheme } = useThemeStore()
  const containerRef = useRef<HTMLDivElement>(null)

  // 点击外部关闭面板
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const currentThemeMeta = THEMES.find(t => t.id === theme) || THEMES[0]

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* 浮动按钮 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'w-10 h-10 rounded-full flex items-center justify-center',
          'bg-surface-card border-2 border-border-default',
          'shadow-hard hover:shadow-hard-lg',
          'transition-all duration-fast',
          'hover:-translate-x-0.5 hover:-translate-y-0.5',
          'active:translate-x-0 active:translate-y-0 active:shadow-none',
          isOpen && 'ring-2 ring-accent'
        )}
        title={`当前主题：${currentThemeMeta.name}`}
      >
        <span className="text-accent">
          {themeIcons[theme]}
        </span>
      </button>

      {/* 主题选择面板 */}
      {isOpen && (
        <div
          className={cn(
            'absolute bottom-12 right-0',
            'w-48 p-2 rounded-lg',
            'bg-surface-card border-2 border-border-default',
            'shadow-hard-lg',
            'animate-in fade-in slide-in-from-bottom-2 duration-fast'
          )}
        >
          <div className="text-xs font-mono text-content-muted uppercase tracking-wider px-2 py-1.5">
            选择主题
          </div>
          
          <div className="space-y-1 mt-1">
            {THEMES.map((themeMeta) => (
              <button
                key={themeMeta.id}
                onClick={() => {
                  setTheme(themeMeta.id)
                  setIsOpen(false)
                }}
                className={cn(
                  'w-full flex items-center gap-3 px-2 py-2 rounded',
                  'transition-colors duration-fast',
                  'hover:bg-surface-elevated',
                  theme === themeMeta.id && 'bg-accent-subtle'
                )}
              >
                {/* 预览色块 */}
                <div
                  className={cn(
                    'w-4 h-4 rounded-sm flex-shrink-0',
                    themePreview[themeMeta.id]
                  )}
                />
                
                {/* 图标 */}
                <span className={cn(
                  'text-content-secondary',
                  theme === themeMeta.id && 'text-accent'
                )}>
                  {themeIcons[themeMeta.id]}
                </span>
                
                {/* 名称 */}
                <span className={cn(
                  'flex-1 text-left text-sm',
                  'text-content-primary',
                  theme === themeMeta.id && 'font-medium'
                )}>
                  {themeMeta.name}
                </span>
                
                {/* 选中标记 */}
                {theme === themeMeta.id && (
                  <Check className="w-4 h-4 text-accent" />
                )}
              </button>
            ))}
          </div>

          {/* 快捷键提示 */}
          <div className="mt-2 pt-2 border-t border-border-divider">
            <div className="text-[10px] font-mono text-content-muted px-2">
              快捷键：Shift + T
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * 内联模式（用于设置面板）
 */
function InlineThemeSwitcher({ className }: { className?: string }) {
  const { theme, setTheme } = useThemeStore()

  return (
    <div className={cn('grid grid-cols-2 gap-2', className)}>
      {THEMES.map((themeMeta) => (
        <button
          key={themeMeta.id}
          onClick={() => setTheme(themeMeta.id)}
          className={cn(
            'flex flex-col items-center gap-2 p-3 rounded-lg',
            'border-2 transition-all duration-fast',
            theme === themeMeta.id
              ? 'border-accent bg-accent-subtle'
              : 'border-border-default bg-surface-card hover:border-border-hover'
          )}
        >
          {/* 预览区域 */}
          <div
            className={cn(
              'w-12 h-12 rounded-lg flex items-center justify-center',
              themePreview[themeMeta.id]
            )}
          >
            <span className="text-content-inverted">
              {themeIcons[themeMeta.id]}
            </span>
          </div>
          
          {/* 名称 */}
          <span className={cn(
            'text-sm font-medium',
            theme === themeMeta.id ? 'text-accent' : 'text-content-primary'
          )}>
            {themeMeta.name}
          </span>
          
          {/* 描述 */}
          <span className="text-[10px] text-content-muted text-center line-clamp-1">
            {themeMeta.description}
          </span>
        </button>
      ))}
    </div>
  )
}

/**
 * 下拉菜单模式（用于导航栏）
 */
function DropdownThemeSwitcher({ className }: { className?: string }) {
  const [isOpen, setIsOpen] = useState(false)
  const { theme, setTheme } = useThemeStore()
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const currentThemeMeta = THEMES.find(t => t.id === theme) || THEMES[0]

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded',
          'text-sm text-content-primary',
          'hover:bg-surface-elevated transition-colors'
        )}
      >
        <span className="text-accent">{themeIcons[theme]}</span>
        <span>{currentThemeMeta.name}</span>
      </button>

      {isOpen && (
        <div
          className={cn(
            'absolute top-full right-0 mt-1',
            'w-40 py-1 rounded-lg',
            'bg-surface-card border border-border-default',
            'shadow-lg z-50'
          )}
        >
          {THEMES.map((themeMeta) => (
            <button
              key={themeMeta.id}
              onClick={() => {
                setTheme(themeMeta.id)
                setIsOpen(false)
              }}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2',
                'text-sm text-content-primary',
                'hover:bg-surface-elevated transition-colors',
                theme === themeMeta.id && 'bg-accent-subtle text-accent'
              )}
            >
              <span>{themeIcons[themeMeta.id]}</span>
              <span>{themeMeta.name}</span>
              {theme === themeMeta.id && (
                <Check className="w-4 h-4 ml-auto" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * 主题切换组件入口
 */
export function ThemeSwitcher({ className, variant = 'floating' }: ThemeSwitcherProps) {
  switch (variant) {
    case 'inline':
      return <InlineThemeSwitcher className={className} />
    case 'dropdown':
      return <DropdownThemeSwitcher className={className} />
    case 'floating':
    default:
      return <FloatingThemeSwitcher className={className} />
  }
}

/**
 * 主题切换快捷键 Hook
 * 按 Shift + T 循环切换主题
 */
export function useThemeShortcut() {
  const { toggleTheme } = useThemeStore()

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.shiftKey && event.key === 'T') {
        event.preventDefault()
        toggleTheme()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggleTheme])
}
