/**
 * =============================
 * SettingsMenu - 设置弹出菜单 (Portal)
 * =============================
 * 
 * 使用语义化 CSS 变量，完全主题自适应
 */

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { User, Cog, ArrowRight, Star, Copy, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { logger } from '@/utils/logger'
import type { SettingsMenuProps } from './types'

/**
 * 格式化 UID 显示：前4位 + ... + 后4位
 * 例如：a1b2...c3d4
 */
function formatUID(uid: string | undefined): string {
  if (!uid) return ''
  if (uid.length <= 10) return uid
  return `${uid.slice(0, 4)}...${uid.slice(-4)}`
}

export function SettingsMenu({
  isOpen,
  isAuthenticated,
  user,
  language,
  onPersonalSettingsClick,
  onSettingsClick,
  onMobileClose,
  onLogout,
  onLanguageChange,
  onClose,
  t,
}: SettingsMenuProps) {
  // Hooks 必须在条件返回之前调用
  const [copied, setCopied] = useState(false)

  if (!isOpen) return null

  const username = user?.username || 'User'
  const avatar = user?.avatar
  const userId = user?.id

  const handleCopyUID = async () => {
    if (!userId) return
    try {
      await navigator.clipboard.writeText(userId)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      logger.error('Failed to copy UID', err)
    }
  }

  return createPortal(
    <div
      data-settings-menu
      className="fixed bottom-[60px] left-8 w-[280px] bg-surface-card backdrop-blur-2xl border-2 border-border-default shadow-theme-card z-[200] mb-4 animate-in fade-in zoom-in-95 slide-in-from-bottom-2 rounded-lg"
      style={{ maxWidth: 'calc(100vw - 32px)' }}
    >
      <div className="p-4 space-y-2">
        {/* 用户信息 */}
        <div className="pb-3 border-b-2 border-border-default">
          <div className="text-[10px] text-content-secondary mb-2 uppercase tracking-wider">
            /// {t('userSettings')}
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              {avatar ? (
                <img src={avatar} alt="Avatar" className="w-10 h-10" />
              ) : (
                <div className="w-10 h-10 bg-content-primary text-surface-card flex items-center justify-center font-bold">
                  {username.charAt(0).toUpperCase()}
                </div>
              )}
              {/* 套餐图标 */}
              <div className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 bg-surface-card flex items-center justify-center">
                <Star className="w-1.5 h-1.5 text-content-primary" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              {/* 用户名 - 单行截断 */}
              <div className="font-bold text-sm truncate" title={username}>
                {username}
              </div>
              
              {/* 套餐 + UID 行 */}
              <div className="flex items-center gap-2">
                {/* 套餐标签 */}
                <span className="text-[10px] text-content-secondary uppercase shrink-0">
                  {isAuthenticated ? (user?.plan || 'Free') : 'Guest'}
                </span>
                
                {/* UID 可复制标签 */}
                {isAuthenticated && userId && (
                  <>
                    <span className="text-[10px] text-content-secondary/40">|</span>
                    <button
                      onClick={handleCopyUID}
                      className={cn(
                        'group flex items-center gap-1 text-[10px] transition-all',
                        copied
                          ? 'text-status-success'
                          : 'text-content-secondary/60 hover:text-content-primary'
                      )}
                      title={copied ? '已复制' : '点击复制 UID'}
                    >
                      <span className="uppercase">UID:</span>
                      <span className="tracking-tight">{formatUID(userId)}</span>
                      {copied ? (
                        <Check className="w-3 h-3" />
                      ) : (
                        <Copy className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                      )}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 设置选项 */}
        <button
          onClick={() => {
            onPersonalSettingsClick?.()
            onClose()
            onMobileClose?.()
          }}
          className="w-full flex items-center gap-3 px-3 py-2.5 border-2 border-border-default hover:bg-accent-hover hover:text-content-primary transition-all text-xs shadow-theme-button hover:[transform:var(--transform-button-hover)] hover:shadow-theme-button-hover active:[transform:var(--transform-button-active)] active:shadow-theme-button-active"
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
          className="w-full flex items-center gap-3 px-3 py-2.5 border-2 border-border-default hover:bg-accent-hover hover:text-content-primary transition-all text-xs shadow-theme-button hover:[transform:var(--transform-button-hover)] hover:shadow-theme-button-hover active:[transform:var(--transform-button-active)] active:shadow-theme-button-active"
        >
          <Cog className="w-4 h-4" />
          <span className="font-bold uppercase">{t('modelConfig')}</span>
        </button>

        {/* 语言切换 - 水平排列 */}
        <div className="pt-1">
          <div className="text-[10px] text-content-secondary uppercase px-1 mb-2 tracking-wider">
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
                  'flex items-center justify-center gap-1.5 px-2 py-2 border font-mono text-[10px] font-bold uppercase transition-all rounded-md',
                  language === lang
                    ? 'bg-accent-hover text-content-primary border-accent'
                    : 'border-border-default hover:border-content-secondary text-content-primary'
                )}
              >
                <span className={cn(
                  'w-1.5 h-1.5 rounded-full',
                  language === lang ? 'bg-content-primary' : 'bg-content-secondary'
                )} />
                {lang === 'zh' ? '中文' : lang === 'en' ? 'EN' : '日本語'}
              </button>
            ))}
          </div>
        </div>

        {/* 退出登录 */}
        {isAuthenticated && (
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 border-2 border-border-default hover:bg-accent-hover hover:text-content-primary transition-all text-xs text-content-primary shadow-theme-button hover:[transform:var(--transform-button-hover)] hover:shadow-theme-button-hover active:[transform:var(--transform-button-active)] active:shadow-theme-button-active mt-2"
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
