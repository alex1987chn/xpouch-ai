import { useState } from 'react'
import { Star, Plane, Crown } from 'lucide-react'
import { getAvatarDisplay } from '@/utils/userSettings'
import { useUserStore } from '@/store/userStore'
import { cn } from '@/lib/utils'

interface SidebarUserSectionProps {
  onPersonalSettingsClick?: () => void
  onMenuOpenChange: (isOpen: boolean) => void
}

export default function SidebarUserSection({ onPersonalSettingsClick, onMenuOpenChange }: SidebarUserSectionProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const { user } = useUserStore()

  // 用户数据
  const username = user?.username || 'User'
  const avatar = user?.avatar
  // 优先使用 Store 中的 plan，如果没有则默认为 Free
  const currentPlan = (user?.plan as 'Free' | 'Pilot' | 'Maestro') || 'Free'

  const handleAvatarClick = () => {
    setIsMenuOpen(!isMenuOpen)
    onMenuOpenChange(!isMenuOpen)
  }

  return (
    <div className="mt-auto mx-auto mb-3 backdrop-blur-md">
      {/* 用户头像 */}
      <div
        onClick={handleAvatarClick}
        data-avatar-button
        className="relative h-10 w-10 shrink-0 cursor-pointer transition-all duration-300 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
      >
        <div className="flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-blue-600 text-xs font-bold text-white shadow-lg overflow-hidden">
          {avatar ? (
            <img
              src={avatar}
              alt="Avatar"
              className="h-full w-full object-cover"
            />
          ) : (
            getAvatarDisplay(avatar || '', username)
          )}
        </div>
        {/* 套餐图标 */}
        <div className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-[#1e293b] bg-white dark:bg-gray-700 dark:border-gray-600 flex items-center justify-center shadow-sm">
          {currentPlan === 'Free' && <Star className="w-1.5 h-1.5 text-purple-500" />}
          {currentPlan === 'Pilot' && <Plane className="w-1.5 h-1.5 text-cyan-500" />}
          {currentPlan === 'Maestro' && <Crown className="w-1.5 h-1.5 text-amber-500" />}
        </div>
      </div>
    </div>
  )
}
