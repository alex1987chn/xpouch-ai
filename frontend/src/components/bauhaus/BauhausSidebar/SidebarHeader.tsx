/**
 * =============================
 * SidebarHeader - Logo 区域 (纯净版)
 * =============================
 * 
 * [设计] 无折叠按钮，专注于品牌展示
 * 折叠功能已移至 UserSection
 */

import { The4DPocketLogo } from '@/components/bauhaus'
import { VERSION } from '@/constants/ui'
import { cn } from '@/lib/utils'
import { TW } from './constants'
import type { SidebarHeaderProps } from './types'

export function SidebarHeader({ isCollapsed, onLogoClick }: SidebarHeaderProps) {
  if (isCollapsed) {
    return (
      <div className="w-full py-4 flex justify-center">
        <div
          onClick={onLogoClick}
          className="cursor-pointer scale-[0.7]"
        >
          <The4DPocketLogo />
        </div>
      </div>
    )
  }

  return (
    <div className="w-full pt-4 pb-8 px-2 flex justify-center">
      <div
        onClick={onLogoClick}
        className={cn('cursor-pointer flex items-center gap-4 group select-none', TW.CONTENT_WIDTH, TW.BUTTON_HEIGHT_LARGE)}
      >
        <div className="shrink-0 flex items-center">
          <The4DPocketLogo />
        </div>
        <div className="flex flex-col justify-center">
          <h1 className="text-xl font-black tracking-tighter uppercase leading-none flex items-center">
            <span className="text-content-muted">[</span>
            <span className="text-accent">X</span>
            <span className="text-content-primary">POUCH</span>
            <span className="text-content-muted">]</span>
          </h1>
          <div className="flex items-center gap-2 mt-0.5">
            <div className="w-1.5 h-1.5 bg-accent rounded-full animate-pulse" />
            <span className="font-mono text-[10px] text-content-secondary tracking-widest group-hover:text-content-primary transition-colors">
              OS {VERSION.CURRENT}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
