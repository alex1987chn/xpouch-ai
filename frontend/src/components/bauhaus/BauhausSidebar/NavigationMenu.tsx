/**
 * =============================
 * NavigationMenu - 主导航菜单
 * =============================
 * 
 * 使用语义化颜色系统，完全主题无关
 * 不再使用 dark: 前缀，所有颜色通过 CSS 变量控制
 */

import { Home, Library, MessageSquare, Shield, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DIMENSIONS } from '@/constants/ui'
import type { NavigationMenuProps } from './types'

export function NavigationMenu({
  isCollapsed,
  isOnHome,
  isOnLibrary,
  isOnHistory,
  isOnAdmin,
  isAdmin,
  showExpertAdmin,
  onMenuClick,
  t,
  toast,
}: NavigationMenuProps) {
  if (isCollapsed) {
    return (
      <div className="flex-1 flex flex-col items-center">
        {/* 主菜单 - 首页、知识库、历史记录 */}
        <div className="flex flex-col items-center space-y-2">
          {/* 首页按钮 */}
          <NavButtonCollapsed
            isActive={isOnHome}
            onClick={() => onMenuClick('/')}
            icon={<Home className="w-4 h-4 flex-shrink-0" />}
            label={t('navDashboard')}
          />

          {/* 资源工坊按钮 */}
          <NavButtonCollapsed
            isActive={isOnLibrary}
            onClick={() => onMenuClick('/library')}
            icon={<Library className="w-4 h-4 flex-shrink-0" />}
            label={t('library')}
          />

          {/* 历史记录按钮 */}
          <NavButtonCollapsed
            isActive={isOnHistory}
            onClick={() => onMenuClick('/history')}
            icon={<MessageSquare className="w-4 h-4 flex-shrink-0" />}
            label={t('history')}
          />

          {/* 管理员按钮 */}
          {showExpertAdmin && (
            <AdminButtonCollapsed
              isActive={isOnAdmin}
              isAdmin={isAdmin}
              onClick={() => {
                if (isAdmin) {
                  onMenuClick('/admin/experts')
                } else {
                  toast({
                    title: t('permissionDenied'),
                    description: t('adminOnly'),
                    variant: 'destructive'
                  })
                }
              }}
              t={t}
            />
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 w-full flex flex-col overflow-hidden">
      {/* 主菜单 - 首页、知识库、历史记录 - 固定不滚动 */}
      <div className="shrink-0 flex flex-col items-center py-2">
        {/* 导航标题 */}
        <div className="px-1 py-2" style={{ width: DIMENSIONS.SIDEBAR_CONTENT_WIDTH }}>
          <h3 className="text-xs font-semibold text-content-muted uppercase tracking-wider font-mono text-[10px]">
            /// Navigation
          </h3>
        </div>

        {/* 首页按钮 */}
        <NavButtonExpanded
          isActive={isOnHome}
          onClick={() => onMenuClick('/')}
          icon={<Home className="w-5 h-5 flex-shrink-0" />}
          label={t('navDashboard')}
        />

        {/* 资源工坊按钮 */}
        <NavButtonExpanded
          isActive={isOnLibrary}
          onClick={() => onMenuClick('/library')}
          icon={<Library className="w-5 h-5 flex-shrink-0" />}
          label={t('library') || 'LIBRARY'}
        />

        {/* 历史记录按钮 */}
        <NavButtonExpanded
          isActive={isOnHistory}
          onClick={() => onMenuClick('/history')}
          icon={<MessageSquare className="w-5 h-5 flex-shrink-0" />}
          label={t('history')}
        />

        {/* 管理员按钮 */}
        {showExpertAdmin && (
          <AdminButtonExpanded
            isActive={isOnAdmin}
            isAdmin={isAdmin}
            onClick={() => {
              if (isAdmin) {
                onMenuClick('/admin/experts')
              } else {
                toast({
                  title: t('permissionDenied'),
                  description: t('adminOnly'),
                  variant: 'destructive'
                })
              }
            }}
            t={t}
          />
        )}
      </div>
    </div>
  )
}

/**
 * 折叠状态下的导航按钮
 */
interface NavButtonCollapsedProps {
  isActive: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}

function NavButtonCollapsed({ isActive, onClick, icon, label }: NavButtonCollapsedProps) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={cn(
        'h-9 w-9 transition-all duration-200 justify-center p-0 rounded-full border-2',
        isActive
          // 激活状态：品牌色背景、硬阴影
          ? 'bg-accent text-content-inverted border-border-default shadow-hard'
          // 非激活状态：透明背景、悬停效果
          : 'border-border-default text-content-muted hover:bg-surface-page hover:text-content-primary'
      )}
    >
      {icon}
    </button>
  )
}

/**
 * 展开状态下的导航按钮
 */
interface NavButtonExpandedProps {
  isActive: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}

function NavButtonExpanded({ isActive, onClick, icon, label }: NavButtonExpandedProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'transition-all duration-200 justify-center py-0 border-2 mb-1',
        isActive
          // 激活状态
          ? 'bg-accent text-content-inverted border-border-default shadow-hard'
          // 非激活状态
          : 'border-transparent text-content-primary hover:bg-surface-page hover:border-border-default'
      )}
      style={{ height: DIMENSIONS.NAV_ITEM_HEIGHT, width: DIMENSIONS.SIDEBAR_CONTENT_WIDTH }}
    >
      <div className="flex items-center gap-3 px-3">
        {icon}
        <span className="font-mono text-xs font-bold tracking-wide uppercase">{label}</span>
      </div>
    </button>
  )
}

/**
 * 折叠状态的管理员按钮
 */
interface AdminButtonCollapsedProps {
  isActive: boolean
  isAdmin: boolean
  onClick: () => void
  t: (key: string) => string
}

function AdminButtonCollapsed({ isActive, isAdmin, onClick, t }: AdminButtonCollapsedProps) {
  return (
    <button
      onClick={onClick}
      title={isAdmin ? t('navExperts') : t('adminOnly')}
      className={cn(
        'h-9 w-9 transition-all duration-200 justify-center p-0 rounded-full border-2 relative',
        isActive
          ? 'bg-accent text-content-inverted border-border-default shadow-hard'
          : 'border-border-default text-content-muted hover:bg-surface-page hover:text-content-primary',
        !isAdmin && 'opacity-50'
      )}
    >
      <Shield className="w-4 h-4 flex-shrink-0" />
      {!isAdmin && (
        <div className="absolute -bottom-1 -right-1 bg-surface-overlay text-content-inverted rounded-full p-0.5">
          <Lock className="w-2.5 h-2.5" />
        </div>
      )}
    </button>
  )
}

/**
 * 展开状态的管理员按钮
 */
interface AdminButtonExpandedProps {
  isActive: boolean
  isAdmin: boolean
  onClick: () => void
  t: (key: string) => string
}

function AdminButtonExpanded({ isActive, isAdmin, onClick, t }: AdminButtonExpandedProps) {
  return (
    <button
      onClick={onClick}
      title={isAdmin ? t('navExperts') : t('adminOnly')}
      className={cn(
        'transition-all duration-200 justify-center py-0 border-2 relative',
        isActive
          ? 'bg-accent text-content-inverted border-border-default shadow-hard'
          : 'border-transparent text-content-primary hover:bg-surface-page hover:border-border-default',
        !isAdmin && 'opacity-50'
      )}
      style={{ height: DIMENSIONS.NAV_ITEM_HEIGHT, width: DIMENSIONS.SIDEBAR_CONTENT_WIDTH }}
    >
      <div className="flex items-center gap-3 px-3">
        <Shield className="w-5 h-5 flex-shrink-0" />
        <span className="font-mono text-xs font-bold tracking-wide uppercase">{t('navExperts')}</span>
        {!isAdmin && (
          <div className="absolute right-3 bg-surface-overlay text-content-inverted rounded-full p-0.5">
            <Lock className="w-3 h-3" />
          </div>
        )}
      </div>
    </button>
  )
}
