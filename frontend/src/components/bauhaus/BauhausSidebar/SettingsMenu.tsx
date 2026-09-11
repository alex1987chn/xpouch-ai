/**
 * =============================
 * SettingsMenu - 设置弹出菜单 (Portal)
 * =============================
 *
 * 布局：容器一张 Bauhaus 边框卡片，内部全部扁平行 + 分隔线分组，
 * 层级靠 hover 高亮与分隔线表达，而非每行独立边框。
 * 使用语义化 CSS 变量，完全主题自适应
 */

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Cog, ArrowRight, Star, Copy, Check, ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { logger } from '@/utils/logger'
import { GithubMark } from '@/components/common'
import { GITHUB_REPO_URL } from '@/constants/links'
import { Z_INDEX } from '@/constants/zIndex'
import { getUsageSummary } from '@/services/usage'
import type { SettingsMenuProps } from './types'

/**
 * 扁平菜单行：与侧边栏导航/最近会话同一习语——
 * 静默态 border-transparent 占位，hover 边框浮现 + surface-page 微底色。
 * 黄色 accent 保留给"选中"语义，不作 hover 色。
 */
const MENU_ROW =
  'w-full flex items-center gap-3 px-3 py-1.5 text-xs border border-transparent hover:border-border-default hover:bg-surface-page transition-all'

/** 危险行（退出登录）：同一习语的 status-offline 红变体 */
const MENU_ROW_DANGER =
  'w-full flex items-center gap-3 px-3 py-1.5 text-xs border border-transparent hover:border-status-offline/60 hover:bg-status-offline/10 hover:text-status-offline transition-all'

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
  onSettingsClick,
  onMobileClose,
  onLogout,
  onLanguageChange,
  onClose,
  t,
}: SettingsMenuProps) {
  // Hooks 必须在条件返回之前调用
  const [copied, setCopied] = useState(false)
  const [usage, setUsage] = useState<{ total: number; today: number } | null>(null)

  useEffect(() => {
    if (!isOpen || !isAuthenticated) return
    let cancelled = false
    getUsageSummary()
      .then((summary) => {
        if (!cancelled) {
          setUsage({ total: summary.total.total_tokens, today: summary.today.total_tokens })
        }
      })
      .catch((err) => {
        logger.warn('Usage summary failed:', err)
      })
    return () => {
      cancelled = true
    }
  }, [isOpen, isAuthenticated])

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
      className="fixed bottom-[60px] left-8 w-[280px] bg-surface-card backdrop-blur-2xl border-theme-card border-border-default shadow-theme-card mb-4 animate-in fade-in zoom-in-95 slide-in-from-bottom-2 rounded-lg"
      style={{ maxWidth: 'calc(100vw - 32px)', zIndex: Z_INDEX.DROPDOWN }}
    >
      <div className="p-2">
        {/* 用户信息头 */}
        <div className="px-2 pb-3 pt-1">
          <div className="text-micro text-content-secondary mb-2 tracking-wider">
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
                <span className="text-micro text-content-secondary shrink-0">
                  {isAuthenticated ? (user?.plan || 'Free') : 'Guest'}
                </span>

                {/* UID 可复制标签 */}
                {isAuthenticated && userId && (
                  <>
                    <span className="text-micro text-content-secondary/40">|</span>
                    <button
                      onClick={handleCopyUID}
                      className={cn(
                        'group flex items-center gap-1 text-micro transition-all',
                        copied
                          ? 'text-status-success'
                          : 'text-content-secondary/60 hover:text-content-primary'
                      )}
                      title={copied ? t('uidCopied') : t('clickToCopyUid')}
                    >
                      <span className="tracking-tight font-mono">UID:</span>
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

        {/* 用量（B5：token 记账可视化，菜单打开时异步获取） */}
        {isAuthenticated && usage && usage.total > 0 && (
          <div className="px-2 pb-2">
            <div className="border border-border-divider px-2 py-1.5 flex items-center justify-between font-mono text-micro text-content-secondary">
              <span className="tracking-wider">{t('usageLabel')}</span>
              <span className="text-content-primary">
                {t('usageToday')} {usage.today.toLocaleString()} · {t('usageTotal')}{' '}
                {usage.total.toLocaleString()}
              </span>
            </div>
          </div>
        )}

        {/* 动作组 */}
        <div className="border-t border-border-divider pt-1">
          <button
            onClick={() => {
              onSettingsClick?.()
              onClose()
              onMobileClose?.()
            }}
            className={MENU_ROW}
          >
            <Cog className="w-4 h-4" />
            <span className="font-bold">{t('settings')}</span>
          </button>

          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={MENU_ROW}
          >
            <GithubMark className="w-4 h-4 shrink-0" />
            <span className="font-bold flex-1">{t('openSource')}</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* 语言切换 - 紧凑单行 */}
        <div className="border-t border-border-divider mt-1 px-3 py-2 flex items-center justify-between gap-2">
          <span className="text-micro text-content-secondary tracking-wider shrink-0">
            /// {t('language')}
          </span>
          <div className="flex items-center gap-1">
            {(['zh', 'en', 'ja'] as const).map((lang) => (
              <button
                key={lang}
                onClick={() => {
                  onLanguageChange(lang)
                  // 语言切换后不关闭菜单，让用户看到切换效果
                }}
                className={cn(
                  'px-1.5 py-0.5 font-mono text-micro font-bold transition-colors rounded-sm',
                  language === lang
                    ? 'bg-accent-hover text-accent-ink'
                    : 'text-content-secondary hover:text-content-primary'
                )}
              >
                {lang === 'zh' ? '中文' : lang === 'en' ? 'EN' : '日本語'}
              </button>
            ))}
          </div>
        </div>

        {/* 退出登录 */}
        {isAuthenticated && (
          <div className="border-t border-border-divider mt-1 pt-1">
            <button onClick={onLogout} className={MENU_ROW_DANGER}>
              <ArrowRight className="w-4 h-4" />
              <span className="font-bold">{t('logout')}</span>
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
