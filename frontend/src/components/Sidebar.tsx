import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import PixelLogo from '@/components/PixelLogo'
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
  onToggleCollapse?: () => void
}

export default function Sidebar({ className, isCollapsed = false, onCreateAgent, onSettingsClick, onPersonalSettingsClick, onToggleCollapse }: SidebarProps) {
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
      'w-full h-full text-gray-600 dark:text-gray-300 flex flex-col',
      className
    )}>
      {/* Logo 区域 - 像素点阵 Logo */}
      <div className="p-2 pb-3 flex items-center justify-center">
        <div onClick={() => navigate('/')} className="cursor-pointer">
          <PixelLogo size={24} variant="pouch" />
        </div>
      </div>

      {/* 菜单和用户区域 */}
      <SidebarMenu isCollapsed={isCollapsed} onCreateAgent={onCreateAgent} />

      {/* 底部功能区 */}
      <div className="mt-auto px-1.5 pb-2 space-y-1">
        {/* 收拢按钮 - 移到用户区域上方 */}
        {onToggleCollapse && (
          <div className="flex justify-center mb-1">
            <button
              onClick={onToggleCollapse}
              className="flex items-center justify-center w-5 h-5 rounded-full bg-gray-200/50 hover:bg-gray-300/50 dark:bg-gray-800/50 dark:hover:bg-gray-700/50 transition-all duration-200 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-violet-500/50 text-gray-600 dark:text-gray-300"
              title={isCollapsed ? '展开侧边栏' : '收拢侧边栏'}
            >
              {isCollapsed ? (
                <ChevronRight className="w-3 h-3" />
              ) : (
                <ChevronLeft className="w-3 h-3" />
              )}
            </button>
          </div>
        )}

        {/* 用户区域 */}
        <div className="flex justify-center">
          <SidebarUserSection
            onPersonalSettingsClick={onPersonalSettingsClick}
            onMenuOpenChange={handleSettingsMenuOpenChange}
          />
        </div>

        {/* 主题切换按钮 */}
        <div className="flex items-center justify-center">
          <ThemeSwitcher />
        </div>
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

