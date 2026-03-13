/**
 * =============================
 * NavigationMenu - 主导航菜单
 * =============================
 * 
 * 使用语义化 CSS 变量，完全主题自适应
 * 所有视觉风格（边框、阴影、变换）由 CSS 变量控制
 */

import { BarChart3, Home, Library, MessageSquare, Shield } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TranslationKey } from '@/i18n'
import { TW } from './constants'

import type { NavigationMenuProps } from './types'

export function NavigationMenu({
  isCollapsed,
  isOnHome,
  isOnLibrary,
  isOnHistory,
  isOnAdmin,
  isOnStats,
  showExpertAdmin,
  onMenuClick,
  t,
}: NavigationMenuProps) {
  if (isCollapsed) {
    return (
      <div className="shrink-0 flex flex-col items-center">
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
              onClick={() => onMenuClick('/admin/experts')}
              t={t}
            />
          )}

          {/* 统计按钮 */}
          <NavButtonCollapsed
            isActive={isOnStats}
            onClick={() => onMenuClick('/admin/stats')}
            icon={<BarChart3 className="w-4 h-4 flex-shrink-0" />}
            label={t('navStats')}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="shrink-0 w-full flex flex-col overflow-hidden">
      {/* 主菜单 - 首页、知识库、历史记录 - 固定不滚动 */}
      <div className="shrink-0 flex flex-col items-center py-2">
        {/* 导航标题 */}
        <div className={cn('px-1 py-2', TW.CONTENT_WIDTH)}>
          <h3 className="text-xs font-semibold text-content-muted uppercase tracking-wider text-[10px]">
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
            onClick={() => onMenuClick('/admin/experts')}
            t={t}
          />
        )}

        {/* 统计按钮 */}
        <NavButtonExpanded
          isActive={isOnStats}
          onClick={() => onMenuClick('/admin/stats')}
          icon={<BarChart3 className="w-5 h-5 flex-shrink-0" />}
          label={t('navStats')}
        />
      </div>
    </div>
  )
}

/**
 * 收拢状态按钮基础样式（共享）
 * 导出供 NewChatButton 使用
 * 
 * [设计] 圆形按钮与 Bauhaus 方形形成反差
 * 小按钮使用更克制的阴影：默认 2px / hover 4px
 */
export const collapsedButtonStyles = (isActive: boolean) => cn(
  'h-10 w-10 flex items-center justify-center transition-all duration-200 p-0 border-2 rounded-full',
  isActive
    ? 'bg-accent text-content-inverted border-border-default shadow-theme-button-sm'
    : 'border-border-default text-content-muted bg-surface-card shadow-theme-button-sm ' +
      'hover:[transform:var(--transform-button-sm-hover)] ' +
      'hover:shadow-theme-button hover:bg-accent-hover hover:text-content-primary hover:border-accent ' +
      'active:[transform:var(--transform-button-active)] active:shadow-theme-button-active'
)

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
      className={collapsedButtonStyles(isActive)}
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
        cn('transition-all duration-200 justify-center py-0 border-2 mb-1', TW.BUTTON_HEIGHT, TW.BUTTON_WIDTH),
        isActive
          // 激活状态
          ? 'bg-accent text-content-inverted border-border-default shadow-theme-button'
          // 非激活状态
          : 'border-transparent text-content-primary hover:bg-surface-page hover:border-border-default'
      )}
    >
      <div className="flex items-center gap-3 px-3">
        {icon}
        <span className="text-xs font-bold tracking-wide uppercase">{label}</span>
      </div>
    </button>
  )
}

/**
 * 折叠状态的管理员按钮
 */
interface AdminButtonCollapsedProps {
  isActive: boolean
  onClick: () => void
  t: (key: TranslationKey) => string
}

function AdminButtonCollapsed({ isActive, onClick, t }: AdminButtonCollapsedProps) {
  return (
    <button
      onClick={onClick}
      title={t('navExperts')}
      className={collapsedButtonStyles(isActive)}
    >
      <Shield className="w-4 h-4 flex-shrink-0" />
    </button>
  )
}

/**
 * 展开状态的管理员按钮
 */
interface AdminButtonExpandedProps {
  isActive: boolean
  onClick: () => void
  t: (key: TranslationKey) => string
}

function AdminButtonExpanded({ isActive, onClick, t }: AdminButtonExpandedProps) {
  return (
    <button
      onClick={onClick}
      title={t('navExperts')}
      className={cn(
        cn('transition-all duration-200 justify-center py-0 border-2 relative', TW.BUTTON_HEIGHT, TW.BUTTON_WIDTH),
        isActive
          ? 'bg-accent text-content-inverted border-border-default shadow-theme-button'
          : 'border-transparent text-content-primary hover:bg-surface-page hover:border-border-default'
      )}
    >
      <div className="flex items-center gap-3 px-3">
        <Shield className="w-5 h-5 flex-shrink-0" />
        <span className="text-xs font-bold tracking-wide uppercase">{t('navExperts')}</span>
      </div>
    </button>
  )
}
