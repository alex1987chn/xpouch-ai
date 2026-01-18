import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
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
      'w-full h-full text-gray-600 dark:text-gray-300 flex flex-col',
      className
    )}>
      {/* Logo 区域 - 像素点阵 Logo */}
      <div className="p-3 pb-4 flex items-center justify-center">
        <div onClick={() => navigate('/')} className="cursor-pointer">
          <PixelLogo size={32} variant="pouch" />
        </div>
      </div>

      {/* 菜单和用户区域 */}
      <SidebarMenu isCollapsed={isCollapsed} onCreateAgent={onCreateAgent} />

      {/* 主题切换 */}
      <div className="px-2 pb-2">
        <div className="flex items-center justify-center mx-auto w-6 h-6 rounded-full border border-gray-300 bg-gray-200/50 hover:bg-gray-300/50 dark:border-gray-700 dark:bg-gray-800/50 dark:hover:bg-gray-700/50 flex items-center justify-center transition-colors shadow-md">
          <ThemeSwitcher />
        </div>
      </div>

      {/* 用户区域 */}
      <SidebarUserSection
        onPersonalSettingsClick={onPersonalSettingsClick}
        onMenuOpenChange={handleSettingsMenuOpenChange}
      />

      {/* 设置弹出菜单 */}
      <SidebarSettingsMenu
        isOpen={isSettingsMenuOpen}
        onPersonalSettingsClick={onPersonalSettingsClick}
        onSettingsClick={onSettingsClick}
        onMenuClose={handleMenuClose}
      />
    </div>
  )
}
