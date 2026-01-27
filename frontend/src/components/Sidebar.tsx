import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import PixelLogo from '@/components/PixelLogo'
import PixelLettersStatic from '@/components/PixelLettersStatic'
import { ThemeSwitcher } from '@/components/ThemeSwitcher'
import SidebarMenu from './SidebarMenu'
import SidebarUserSection from './SidebarUserSection'
import SidebarSettingsMenu from './SidebarSettingsMenu'
import { Menu, ChevronRight } from 'lucide-react'

interface SidebarProps {
  className?: string
  isCollapsed?: boolean
  onCreateAgent?: () => void
  onSettingsClick?: () => void
  onPersonalSettingsClick?: () => void
  onToggleCollapsed?: () => void
}

export default function Sidebar({ className, isCollapsed = false, onCreateAgent, onSettingsClick, onPersonalSettingsClick, onToggleCollapsed }: SidebarProps) {
  const navigate = useNavigate()
  const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState(false)

  const handleSettingsMenuOpenChange = (isOpen: boolean) => {
    setIsSettingsMenuOpen(isOpen)
  }

  const handleMenuClose = () => {
    setIsSettingsMenuOpen(false)
  }

  return (
    <div className={cn(
      'w-full h-full text-gray-700 dark:text-gray-300 flex flex-col',
      className
    )}>
      {/* Logo 区域 */}
      <div className={cn(
        'flex items-center relative',
        isCollapsed ? 'py-3 justify-center' : 'py-3 px-4'
      )}>
        <div onClick={() => navigate('/')} className={cn(
          'cursor-pointer flex items-center justify-center',
          isCollapsed ? 'scale-[0.7]' : 'max-w-[160px] mx-auto'
        )}>
          {isCollapsed ? (
            <PixelLogo variant="pouch" size={32} />
          ) : (
            <div className="flex items-center justify-center">
              <PixelLettersStatic />
            </div>
          )}
        </div>
        
        {/* 侧边栏切换按钮 - 仅在桌面端且侧边栏展开时显示 */}
        {!isCollapsed && onToggleCollapsed && (
          <button
            onClick={onToggleCollapsed}
            className="absolute hidden lg:flex p-1.5 rounded-lg transition-all duration-200 bg-white/80 dark:bg-slate-900/80 hover:bg-gray-100/80 dark:hover:bg-slate-800/80 hover:scale-105 border border-gray-200/50 dark:border-gray-700/50 focus:outline-none shadow text-gray-500 dark:text-gray-400 right-2 top-1/2 -translate-y-1/2"
            title="收拢侧边栏"
          >
            <Menu className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* 菜单区域 */}
      <div className="flex-1">
        <SidebarMenu isCollapsed={isCollapsed} onCreateAgent={onCreateAgent} />
      </div>

      {/* 底部功能区 */}
      <div className={cn(
        'border-t border-gray-100 dark:border-white/5',
        isCollapsed ? 'p-2 flex flex-col items-center gap-2' : 'p-3'
      )}>
        {/* 窄侧边栏：显示用户区域和展开按钮 */}
        {isCollapsed ? (
          <div className="flex flex-col items-center gap-2">
            <SidebarUserSection
              isCollapsed={isCollapsed}
              isMenuOpen={isSettingsMenuOpen}
              onPersonalSettingsClick={onPersonalSettingsClick}
              onMenuOpenChange={handleSettingsMenuOpenChange}
            />
            {/* 展开侧边栏按钮 */}
            {onToggleCollapsed && (
              <button
                onClick={onToggleCollapsed}
                className="p-1.5 rounded-lg transition-all duration-200 bg-gray-100/70 dark:bg-gray-800/70 hover:bg-gray-200/70 dark:hover:bg-gray-700/70 hover:scale-105 border border-gray-300/30 dark:border-gray-600/30 focus:outline-none shadow text-gray-500 dark:text-gray-400"
                title="展开侧边栏"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ) : (
          /* 宽侧边栏：横向布局 */
          <div className="flex items-center gap-3">
            {/* 用户区域 */}
            <SidebarUserSection
              isCollapsed={isCollapsed}
              isMenuOpen={isSettingsMenuOpen}
              onPersonalSettingsClick={onPersonalSettingsClick}
              onMenuOpenChange={handleSettingsMenuOpenChange}
            />

            {/* 分隔线 */}
            <div className="w-px h-8 bg-gray-200 dark:bg-white/10 flex-shrink-0 hidden lg:block" />

            {/* 主题切换 */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <ThemeSwitcher />
            </div>
          </div>
        )}
      </div>

      {/* 设置弹出菜单 - 使用 Portal 突破 stacking context */}
      {isSettingsMenuOpen && createPortal(
        <SidebarSettingsMenu
          isOpen={isSettingsMenuOpen}
          onPersonalSettingsClick={onPersonalSettingsClick}
          onSettingsClick={onSettingsClick}
          onMenuClose={handleMenuClose}
        />,
        document.body
      )}
    </div>
  )
}


