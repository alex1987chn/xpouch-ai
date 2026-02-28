/**
 * =============================
 * NavigationMenu - 主导航菜单
 * =============================
 */

import { Home, Library, MessageSquare, Shield, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
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
          <button
            onClick={() => onMenuClick('/')}
            className={cn(
              'h-9 w-9 transition-all duration-200 justify-center p-0 rounded-full border-2',
              isOnHome
                ? 'bg-[var(--accent-hover)] text-black border-[var(--border-color)] shadow-[4px_4px_0_0_var(--shadow-color)]'
                : 'border-[var(--border-color)] text-slate-400 hover:bg-[var(--bg-page)] hover:text-gray-700 dark:hover:text-slate-200'
            )}
          >
            <Home className="w-4 h-4 flex-shrink-0" />
          </button>

          {/* 资源工坊按钮 */}
          <button
            onClick={() => onMenuClick('/library')}
            className={cn(
              'h-9 w-9 transition-all duration-200 justify-center p-0 rounded-full border-2',
              isOnLibrary
                ? 'bg-[var(--accent-hover)] text-black border-[var(--border-color)] shadow-[4px_4px_0_0_var(--shadow-color)]'
                : 'border-[var(--border-color)] text-slate-400 hover:bg-[var(--bg-page)] hover:text-gray-700 dark:hover:text-slate-200'
            )}
          >
            <Library className="w-4 h-4 flex-shrink-0" />
          </button>

          {/* 历史记录按钮 */}
          <button
            onClick={() => onMenuClick('/history')}
            className={cn(
              'h-9 w-9 transition-all duration-200 justify-center p-0 rounded-full border-2',
              isOnHistory
                ? 'bg-[var(--accent-hover)] text-black border-[var(--border-color)] shadow-[4px_4px_0_0_var(--shadow-color)]'
                : 'border-[var(--border-color)] text-slate-400 hover:bg-[var(--bg-page)] hover:text-gray-700 dark:hover:text-slate-200'
            )}
          >
            <MessageSquare className="w-4 h-4 flex-shrink-0" />
          </button>

          {/* 管理员按钮 - 对所有登录用户可见，非管理员带锁 */}
          {showExpertAdmin && (
            <button
              onClick={() => {
                if (isAdmin) {
                  onMenuClick('/admin/experts')
                } else {
                  toast({
                    title: '权限不足',
                    description: '该功能仅限管理员使用',
                    variant: 'destructive'
                  })
                }
              }}
              className={cn(
                'h-9 w-9 transition-all duration-200 justify-center p-0 rounded-full border-2 relative',
                isOnAdmin
                  ? 'bg-[var(--accent-hover)] text-black border-[var(--border-color)] shadow-[4px_4px_0_0_var(--shadow-color)]'
                  : 'border-[var(--border-color)] text-slate-400 hover:bg-[var(--bg-page)] hover:text-gray-700 dark:hover:text-slate-200',
                !isAdmin && 'opacity-50'
              )}
              title={isAdmin ? t('navExperts') : '该功能仅限管理员使用'}
            >
              <Shield className="w-4 h-4 flex-shrink-0" />
              {!isAdmin && (
                <div className="absolute -bottom-1 -right-1 bg-black text-white rounded-full p-0.5">
                  <Lock className="w-2.5 h-2.5" />
                </div>
              )}
            </button>
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
        <div className="px-1 py-2 w-[230px]">
          <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-mono text-[10px]">
            /// Navigation
          </h3>
        </div>
        {/* 首页按钮 */}
        <button
          onClick={() => onMenuClick('/')}
          className={cn(
            'h-[44px] transition-all duration-200 justify-center py-0 w-[230px] border-2 mb-1',
            isOnHome
              ? 'bg-[var(--accent-hover)] text-black border-[var(--border-color)] shadow-[4px_4px_0_0_var(--shadow-color)]'
              : 'border-transparent text-[var(--text-primary)] hover:bg-[var(--bg-page)] hover:border-[var(--border-color)]'
          )}
        >
          <div className="flex items-center gap-3 px-3">
            <Home className="w-5 h-5 flex-shrink-0" />
            <span className="font-mono text-xs font-bold tracking-wide uppercase">{t('navDashboard')}</span>
          </div>
        </button>

        {/* 资源工坊按钮 */}
        <button
          onClick={() => onMenuClick('/library')}
          className={cn(
            'h-[44px] transition-all duration-200 justify-center py-0 w-[230px] border-2 mb-1',
            isOnLibrary
              ? 'bg-[var(--accent-hover)] text-black border-[var(--border-color)] shadow-[4px_4px_0_0_var(--shadow-color)]'
              : 'border-transparent text-[var(--text-primary)] hover:bg-[var(--bg-page)] hover:border-[var(--border-color)]'
          )}
        >
          <div className="flex items-center gap-3 px-3">
            <Library className="w-5 h-5 flex-shrink-0" />
            <span className="font-mono text-xs font-bold tracking-wide uppercase">{t('library') || 'LIBRARY'}</span>
          </div>
        </button>

        {/* 历史记录按钮 */}
        <button
          onClick={() => onMenuClick('/history')}
          className={cn(
            'h-[44px] transition-all duration-200 justify-center py-0 w-[230px] border-2 mb-1',
            isOnHistory
              ? 'bg-[var(--accent-hover)] text-black border-[var(--border-color)] shadow-[4px_4px_0_0_var(--shadow-color)]'
              : 'border-transparent text-[var(--text-primary)] hover:bg-[var(--bg-page)] hover:border-[var(--border-color)]'
          )}
        >
          <div className="flex items-center gap-3 px-3">
            <MessageSquare className="w-5 h-5 flex-shrink-0" />
            <span className="font-mono text-xs font-bold tracking-wide uppercase">{t('history')}</span>
          </div>
        </button>

        {/* 管理员按钮 - 对所有登录用户可见，非管理员带锁 */}
        {showExpertAdmin && (
          <button
            onClick={() => {
              if (isAdmin) {
                onMenuClick('/admin/experts')
              } else {
                toast({
                  title: '权限不足',
                  description: '该功能仅限管理员使用',
                  variant: 'destructive'
                })
              }
            }}
            className={cn(
              'h-[44px] transition-all duration-200 justify-center py-0 w-[230px] border-2 relative',
              isOnAdmin
                ? 'bg-[var(--accent-hover)] text-black border-[var(--border-color)] shadow-[4px_4px_0_0_var(--shadow-color)]'
                : 'border-transparent text-[var(--text-primary)] hover:bg-[var(--bg-page)] hover:border-[var(--border-color)]',
              !isAdmin && 'opacity-50'
            )}
            title={isAdmin ? t('navExperts') : '该功能仅限管理员使用'}
          >
            <div className="flex items-center gap-3 px-3">
              <Shield className="w-5 h-5 flex-shrink-0" />
              <span className="font-mono text-xs font-bold tracking-wide uppercase">{t('navExperts')}</span>
              {!isAdmin && (
                <div className="absolute right-3 bg-black text-white rounded-full p-0.5">
                  <Lock className="w-3 h-3" />
                </div>
              )}
            </div>
          </button>
        )}
      </div>
    </div>
  )
}
