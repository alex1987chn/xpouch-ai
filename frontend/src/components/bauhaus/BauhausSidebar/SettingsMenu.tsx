/**
 * =============================
 * SettingsMenu - 设置弹出菜单 (Portal)
 * =============================
 */

import { createPortal } from 'react-dom'
import { User, Cog, ArrowRight, Star, Plane, Crown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SettingsMenuProps } from './types'

export function SettingsMenu({
  isOpen,
  isAuthenticated,
  user,
  currentPlan,
  language,
  onPersonalSettingsClick,
  onSettingsClick,
  onMobileClose,
  onLogout,
  onLanguageChange,
  onClose,
  t,
}: SettingsMenuProps) {
  if (!isOpen) return null

  const username = user?.username || 'User'
  const avatar = user?.avatar

  return createPortal(
    <div
      data-settings-menu
      className="fixed bottom-[60px] bg-[rgb(var(--surface-card))] backdrop-blur-2xl border-2 border-[rgb(var(--border-default))] shadow-[rgb(var(--shadow-color))_4px_4px_0_0] z-[200] mb-4 animate-in fade-in zoom-in-95 slide-in-from-bottom-2"
      style={{
        width: '280px',
        maxWidth: 'calc(100vw - 32px)',
        left: '32px',
      }}
    >
      <div className="p-4 space-y-2">
        {/* 用户信息 */}
        <div className="pb-3 border-b-2 border-[rgb(var(--border-default))]">
          <div className="font-mono text-[10px] text-[rgb(var(--content-secondary))] mb-2">
            /// {t('userSettings')}
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              {avatar ? (
                <img src={avatar} alt="Avatar" className="w-10 h-10 border-2 border-[rgb(var(--border-default))] shadow-[rgb(var(--shadow-color))_2px_2px_0_0]" />
              ) : (
                <div className="w-10 h-10 bg-[rgb(var(--content-primary))] text-[rgb(var(--surface-card))] flex items-center justify-center font-bold border-2 border-[rgb(var(--border-default))] shadow-[rgb(var(--shadow-color))_2px_2px_0_0]">
                  {username.charAt(0).toUpperCase()}
                </div>
              )}
              {/* 套餐图标 - Bauhaus方形风格 */}
              <div className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 border-2 border-[rgb(var(--border-default))] bg-[rgb(var(--surface-card))] flex items-center justify-center shadow-sm">
                {currentPlan === 'Free' && <Star className="w-1.5 h-1.5 text-purple-500" />}
                {currentPlan === 'Pilot' && <Plane className="w-1.5 h-1.5 text-cyan-500" />}
                {currentPlan === 'Maestro' && <Crown className="w-1.5 h-1.5 text-amber-500" />}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm truncate">{username}</div>
              <div className="text-[10px] font-mono text-[rgb(var(--content-secondary))] uppercase">
                {isAuthenticated ? (user?.plan || 'Free') : 'Guest'}
              </div>
            </div>
          </div>
        </div>

        {/* 设置选项 - Bauhaus风格 */}
        <button
          onClick={() => {
            onPersonalSettingsClick?.()
            onClose()
            onMobileClose?.()
          }}
          className="w-full flex items-center gap-3 px-3 py-2.5 border-2 border-[rgb(var(--border-default))] hover:bg-[rgb(var(--accent-hover))] hover:text-black transition-all font-mono text-xs shadow-[rgb(var(--shadow-color))_2px_2px_0_0] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[rgb(var(--shadow-color))_3px_3px_0_0] active:translate-x-0 active:translate-y-0 active:shadow-[rgb(var(--shadow-color))_2px_2px_0_0]"
        >
          <User className="w-4 h-4" />
          <span className="font-bold uppercase">{t('personalSettings')}</span>
        </button>

        <button
          onClick={() => {
            onSettingsClick?.()
            onClose()
            onMobileClose?.()
          }}
          className="w-full flex items-center gap-3 px-3 py-2.5 border-2 border-[rgb(var(--border-default))] hover:bg-[rgb(var(--accent-hover))] hover:text-black transition-all font-mono text-xs shadow-[rgb(var(--shadow-color))_2px_2px_0_0] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[rgb(var(--shadow-color))_3px_3px_0_0] active:translate-x-0 active:translate-y-0 active:shadow-[rgb(var(--shadow-color))_2px_2px_0_0]"
        >
          <Cog className="w-4 h-4" />
          <span className="font-bold uppercase">{t('modelConfig')}</span>
        </button>

        {/* 语言切换 - Bauhaus风格 水平排列 */}
        <div className="pt-1">
          <div className="font-mono text-[10px] text-[rgb(var(--content-secondary))] uppercase px-1 mb-2">
            /// {t('language')}
          </div>
          <div className="grid grid-cols-3 gap-1">
            {(['zh', 'en', 'ja'] as const).map((lang) => (
              <button
                key={lang}
                onClick={() => {
                  onLanguageChange(lang)
                  // 语言切换后不关闭菜单，让用户看到切换效果
                }}
                className={cn(
                  'flex items-center justify-center gap-1.5 px-2 py-2 border-2 font-mono text-[10px] font-bold uppercase transition-all',
                  language === lang
                    ? 'bg-[var(--accent-hover)] text-black border-black'
                    : 'border-[rgb(var(--border-default))] hover:border-[rgb(var(--content-secondary))] text-[rgb(var(--content-primary))]'
                )}
              >
                <span className={cn(
                  'w-1.5 h-1.5 rounded-full',
                  language === lang ? 'bg-black' : 'bg-[rgb(var(--content-secondary))]'
                )} />
                {lang === 'zh' ? '中文' : lang === 'en' ? 'EN' : '日本語'}
              </button>
            ))}
          </div>
        </div>

        {/* 退出登录 - 统一风格 */}
        {isAuthenticated && (
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 border-2 border-[rgb(var(--border-default))] hover:bg-[rgb(var(--accent-hover))] hover:text-black transition-all font-mono text-xs text-[rgb(var(--content-primary))] shadow-[rgb(var(--shadow-color))_2px_2px_0_0] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[rgb(var(--shadow-color))_3px_3px_0_0] active:translate-x-0 active:translate-y-0 active:shadow-[rgb(var(--shadow-color))_2px_2px_0_0] mt-2"
          >
            <ArrowRight className="w-4 h-4" />
            <span className="font-bold uppercase">{t('logout')}</span>
          </button>
        )}
      </div>
    </div>,
    document.body
  )
}
