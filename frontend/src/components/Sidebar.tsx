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

interface SidebarProps {
  className?: string
  isCollapsed?: boolean
  onCreateAgent?: () => void
  onSettingsClick?: () => void
  onPersonalSettingsClick?: () => void
}

export default function Sidebar({ className, isCollapsed = false, onCreateAgent, onSettingsClick, onPersonalSettingsClick }: SidebarProps) {
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
        'flex items-center justify-center',
        isCollapsed ? 'py-3' : 'py-4'
      )}>
        <div onClick={() => navigate('/')} className={cn(
          'cursor-pointer',
          isCollapsed ? 'scale-[0.7]' : 'scale-[0.45]'
        )}>
          {isCollapsed ? (
            <PixelLogo variant="pouch" size={32} />
          ) : (
            <PixelLettersStatic />
          )}
        </div>
      </div>

      {/* 菜单区域 */}
      <div className="flex-1">
        <SidebarMenu isCollapsed={isCollapsed} onCreateAgent={onCreateAgent} />
      </div>

      {/* 底部功能区 */}
      <div className="p-3 border-t border-gray-100 dark:border-white/5">
        {!isCollapsed && (
          /* 宽侧边栏：紧凑行布局 */
          <div className="flex items-center gap-3">
            {/* 用户区域 */}
            <SidebarUserSection
              isCollapsed={isCollapsed}
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


