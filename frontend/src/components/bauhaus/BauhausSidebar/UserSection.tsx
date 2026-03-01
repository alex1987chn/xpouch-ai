/**
 * =============================
 * UserSection - 底部用户区域
 * =============================
 */

import { User, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { getAvatarDisplay } from '@/utils/userSettings'
import { useTranslation } from '@/i18n'
import type { UserSectionProps } from './types'

export function UserSection({
  isCollapsed,
  isAuthenticated,
  user,
  currentPlan,
  planLabel,
  onAvatarClick,
  onToggleCollapsed,
  onLoginClick,
}: UserSectionProps) {
  const { t } = useTranslation()
  const username = user?.username || 'User'
  const avatar = user?.avatar

  return (
    <div className={cn(
      'border-t-2 border-border shrink-0',
      isCollapsed ? 'p-2 flex flex-col items-center gap-2' : 'p-3'
    )}>
      {isAuthenticated ? (
        // 已登录状态 - 显示用户头像
        isCollapsed ? (
          <div className="flex flex-col items-center gap-2">
            <div
              onClick={onAvatarClick}
              data-avatar-button=""
              className="flex items-center justify-center cursor-pointer transition-all duration-200 hover:bg-surface-page rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
            >
              <Avatar className="h-8 w-8 border-2 border-border shadow-hard-sm">
                <AvatarImage src={avatar} alt="Avatar" />
                <AvatarFallback className="bg-gradient-to-br from-violet-500 to-blue-600 text-[10px] font-bold text-white">
                  {getAvatarDisplay(avatar || '', username)}
                </AvatarFallback>
              </Avatar>
            </div>
            {/* 展开按钮 - Bauhaus风格 */}
            {onToggleCollapsed && (
              <button
                onClick={onToggleCollapsed}
                className="p-1.5 border-2 border-border bg-surface-page shadow-hard-sm hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-hard-sm"
                title={t('expandSidebar')}
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ) : (
          <div className="relative group cursor-pointer w-[230px] mx-auto mb-2">
            <div className="absolute inset-0 bg-[rgb(var(--shadow-color))] translate-x-1 translate-y-1 transition-transform group-hover:translate-x-2 group-hover:translate-y-2"></div>
            <div
              onClick={onAvatarClick}
              data-avatar-button=""
              className="relative flex items-center gap-3 px-4 py-3 border-2 border-border bg-surface-page z-10 transition-all"
              style={{ width: '230px', height: '63px' }}
            >
              {/* 头像 */}
              {avatar ? (
                <img src={avatar} alt="Avatar" className="w-8 h-8 border-2 border-border shrink-0" />
              ) : (
                <div className="w-8 h-8 bg-[rgb(var(--content-primary))] text-[rgb(var(--surface-card))] flex items-center justify-center font-bold text-sm shrink-0 border-2 border-border">
                  {username.charAt(0).toUpperCase()}
                </div>
              )}
              {/* 名字 */}
              <div className="flex-1">
                <div className="font-bold text-sm uppercase" title={username}>
                  {username}
                </div>
                <div className="text-[10px] font-mono text-content-secondary">
                  PLAN: {planLabel}
                </div>
              </div>
              {/* 状态指示点 */}
              <div className="w-2 h-2 bg-status-online rounded-full border border-border shrink-0"></div>
            </div>
          </div>
        )
      ) : (
        // 未登录状态 - 显示登录按钮
        isCollapsed ? (
          <button
            onClick={onLoginClick}
            className="p-2 border-2 border-border bg-accent-hover text-content-primary shadow-hard-sm hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-hard-sm transition-all"
            title={t('login')}
          >
            <User className="w-5 h-5" />
          </button>
        ) : (
          <div className="relative group w-[230px] mx-auto">
            <div className="absolute inset-0 bg-[rgb(var(--shadow-color))] translate-x-1 translate-y-1 transition-transform group-hover:translate-x-2 group-hover:translate-y-2"></div>
            <button
              onClick={onLoginClick}
              className="relative w-full flex items-center justify-center gap-3 px-4 py-3 border-2 border-border bg-accent-hover text-content-primary z-10 transition-all font-bold font-mono text-sm uppercase"
            >
              <User className="w-5 h-5" />
              <span>登录 / LOGIN</span>
            </button>
          </div>
        )
      )}
    </div>
  )
}
