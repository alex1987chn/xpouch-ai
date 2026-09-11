/**
 * SubPageLayout - 内容页统一子菜单布局（可复用）
 *
 * [设计] 资源库 / 系统管理 / 运行统计等内容页共用：
 * 168px 侧边子菜单（subrail，浅底圆角选中项）+ 独立滚动正文。
 * 窄屏降级为顶部横向滚动页签条。
 * 页面标题（17px 粗体）由各页在正文顶部自行渲染（带 right 插槽）。
 */

import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SubPageMenuItem {
  key: string
  label: string
  icon?: LucideIcon
}

interface SubPageLayoutProps {
  menu: SubPageMenuItem[]
  active: string
  onSelect: (key: string) => void
  children: ReactNode
}

export function SubPageLayout({ menu, active, onSelect, children }: SubPageLayoutProps) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-page lg:flex-row">
      {/* 子菜单（subrail） */}
      <div className="hidden w-[168px] shrink-0 flex-col gap-0.5 border-r border-border-divider bg-surface-card p-2.5 lg:flex">
        {menu.map(item => (
          <button
            key={item.key}
            onClick={() => onSelect(item.key)}
            className={cn(
              'flex items-center gap-2 rounded-md px-3 py-2 text-[13px] transition-colors',
              active === item.key
                ? 'bg-surface-tint font-bold text-content-primary'
                : 'font-medium text-content-secondary hover:bg-surface-tint/60 hover:text-content-primary'
            )}
          >
            {item.icon && <item.icon className="h-4 w-4" />}
            <span className="truncate">{item.label}</span>
          </button>
        ))}
        {menu.some(m => m.key === active) && <span className="flex-1" />}
      </div>

      {/* 窄屏：横向页签条 */}
      <div className="w-full shrink-0 border-b border-border-divider bg-surface-card p-2 lg:hidden">
        <div className="flex gap-1 overflow-x-auto">
          {menu.map(item => (
            <button
              key={item.key}
              onClick={() => onSelect(item.key)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors',
                active === item.key
                  ? 'bg-surface-tint font-bold text-content-primary'
                  : 'font-medium text-content-secondary hover:bg-surface-tint/60'
              )}
            >
              {item.icon && <item.icon className="h-3.5 w-3.5" />}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 正文：独立滚动 */}
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-6 py-6 md:px-8">
        {children}
      </div>
    </div>
  )
}

/** 内容页标题行（17px 粗体 + 右侧插槽，1px 分隔底） */
export function SubPageHeader({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between border-b border-border-divider pb-3">
      <h2 className="text-[17px] font-bold text-content-primary">{title}</h2>
      {right}
    </div>
  )
}
