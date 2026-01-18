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
    <div className="mt-auto mx-3 mb-6 pb-6 backdrop-blur-md">
      {/* 用户一体化容器 */}
      <div
        onClick={handleAvatarClick}
        data-avatar-button
        className="flex items-center justify-center rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md p-2 transition-all hover:bg-white/10 cursor-pointer group outline-none focus:outline-none ring-0 focus:ring-0 select-none !important:border-transparent"
      >
        {/* 头像部分 */}
        <div className="relative h-9 w-9 shrink-0">
          <div className="flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-blue-600 text-[11px] font-bold text-white shadow-inner overflow-hidden transition-all duration-300">
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
          <div className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-[#1e293b] bg-white dark:bg-gray-700 dark:border-gray-600 flex items-center justify-center shadow-sm">
            {currentPlan === 'Free' && <Star className="w-1.5 h-1.5 text-purple-500" />}
            {currentPlan === 'Pilot' && <Plane className="w-1.5 h-1.5 text-cyan-500" />}
            {currentPlan === 'Maestro' && <Crown className="w-1.5 h-1.5 text-amber-500" />}
          </div>
        </div>
      </div>
    </div>
  )
}
