/**
 * =============================
 * SidebarHeader - Logo 区域
 * =============================
 */

import { The4DPocketLogo } from '@/components/bauhaus'
import { VERSION } from '@/constants/ui'
import type { SidebarHeaderProps } from './types'

export function SidebarHeader({ isCollapsed, onLogoClick }: SidebarHeaderProps) {
  return (
    <div className="flex items-center relative">
      {isCollapsed ? (
        <div className="w-full py-3 justify-center flex items-center">
          <div
            onClick={onLogoClick}
            className="cursor-pointer scale-[0.7]"
          >
            <The4DPocketLogo />
          </div>
        </div>
      ) : (
        <div className="w-full pt-4 pb-8 px-2 flex justify-center">
          <div
            onClick={onLogoClick}
            className="cursor-pointer flex items-center gap-4 group select-none w-[230px] h-[60px]"
          >
            <div className="shrink-0 flex items-center">
              <The4DPocketLogo />
            </div>
            <div className="flex flex-col justify-center">
              {/* 工业风格 Logo: [ XPOUCH ] */}
              <h1 className="text-xl font-black tracking-tighter uppercase leading-none flex items-center">
                <span className="text-gray-400">[</span>
                <span className="text-yellow-400">X</span>
                <span className="text-slate-900 dark:text-slate-100">POUCH</span>
                <span className="text-gray-400">]</span>
              </h1>
              <div className="flex items-center gap-2 mt-0.5">
                <div className="w-1.5 h-1.5 bg-[var(--accent-hover)] rounded-full animate-pulse"></div>
                <span className="font-mono text-[10px] text-[var(--text-secondary)] tracking-widest group-hover:text-[var(--text-primary)] transition-colors">OS {VERSION.CURRENT}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
