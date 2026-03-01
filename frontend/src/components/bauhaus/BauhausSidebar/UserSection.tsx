/**
 * =============================
 * UserSection - 底部用户区域 (含折叠开关)
 * =============================
 * 
 * [设计] 机械开关风格
 * - 展开时：用户卡片右侧有一条竖直把手
 * - 收拢时：头像下方有一条横置把手
 */

import { User, GripVertical, GripHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { getAvatarDisplay } from '@/utils/userSettings'
import { useTranslation } from '@/i18n'
import { TW } from './constants'
import type { UserSectionProps } from './types'

export function UserSection({
  isCollapsed,
  isAuthenticated,
  user,
  planLabel,
  onAvatarClick,
  onLoginClick,
  onToggleCollapsed,
}: UserSectionProps) {
  const { t } = useTranslation()
  const username = user?.username || 'User'
  const avatar = user?.avatar

  if (isCollapsed) {
    return (
      <div className="flex flex-col">
        {/* 用户区域 */}
        <div className={cn(
          'border-t-2 border-border shrink-0 p-2 flex flex-col items-center gap-2'
        )}>
          {isAuthenticated ? (
            <div
              onClick={onAvatarClick}
              data-avatar-button=""
              className="flex items-center justify-center cursor-pointer transition-all duration-200 hover:bg-surface-page p-2 focus:outline-none focus:ring-2 focus:ring-accent/50"
            >
              <Avatar className="h-8 w-8 border-2 border-border shadow-hard-sm">
                <AvatarImage src={avatar} alt="Avatar" />
                <AvatarFallback className="bg-gradient-to-br from-violet-500 to-blue-600 text-[10px] font-bold text-white">
                  {getAvatarDisplay(avatar || '', username)}
                </AvatarFallback>
              </Avatar>
            </div>
          ) : (
            <button
              onClick={onLoginClick}
              className="p-2 border-2 border-border bg-accent-hover text-content-primary shadow-hard-sm hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-hard-sm transition-all"
              title={t('login')}
            >
              <User className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* 展开把手 - 横置窄条 */}
        {onToggleCollapsed && (
          <button
            onClick={onToggleCollapsed}
            className={cn(
              'w-full h-5 flex items-center justify-center',
              'bg-surface-elevated border-t border-border',
              'hover:bg-accent-hover',
              'text-content-muted/50 hover:text-accent',
              'transition-all duration-200',
              'group'
            )}
            title={t('expandSidebar')}
          >
            <GripHorizontal className="w-4 h-4 group-hover:scale-110 transition-transform" />
          </button>
        )}
      </div>
    )
  }

  // 展开状态
  return (
    <div className="flex">
      {/* 用户区域 */}
      <div className={cn(
        'flex-1 border-t-2 border-border shrink-0 p-3'
      )}>
        {isAuthenticated ? (
          <div className={cn('relative group cursor-pointer mx-auto', TW.CONTENT_WIDTH)}>
            <div className="absolute inset-0 bg-[rgb(var(--shadow-color))] translate-x-1 translate-y-1 transition-transform group-hover:translate-x-2 group-hover:translate-y-2"></div>
            <div
              onClick={onAvatarClick}
              data-avatar-button=""
              className="relative flex items-center gap-3 px-4 py-3 border-2 border-border bg-surface-page z-10 transition-all w-[230px] h-[63px]"
            >
              {avatar ? (
                <img src={avatar} alt="Avatar" className="w-8 h-8 border-2 border-border shrink-0" />
              ) : (
                <div className="w-8 h-8 bg-content-primary text-surface-card flex items-center justify-center font-bold text-sm shrink-0 border-2 border-border">
                  {username.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex-1">
                <div className="font-bold text-sm uppercase" title={username}>
                  {username}
                </div>
                <div className="text-[10px] font-mono text-content-secondary">
                  PLAN: {planLabel}
                </div>
              </div>
              <div className="w-2 h-2 bg-status-online border border-border shrink-0"></div>
            </div>
          </div>
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
        )}
      </div>

      {/* 收拢把手 - 竖直窄条 */}
      {onToggleCollapsed && (
        <button
          onClick={onToggleCollapsed}
          className={cn(
            'w-5 border-t-2 border-l border-border',
            'bg-surface-elevated',
            'hover:bg-status-offline/10',
            'flex items-center justify-center',
            'text-content-muted/50 hover:text-status-offline',
            'transition-all duration-200',
            'group'
          )}
          title={t('collapseSidebar')}
        >
          <GripVertical className="w-4 h-4 group-hover:scale-110 transition-transform" />
        </button>
      )}
    </div>
  )
}
