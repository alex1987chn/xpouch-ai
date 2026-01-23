import { useState } from 'react'
import { Star, Plane, Crown } from 'lucide-react'
import { getAvatarDisplay } from '@/utils/userSettings'
import { useUserStore } from '@/store/userStore'
import { cn } from '@/lib/utils'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'

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
    <div className="mb-2 backdrop-blur-md">
      {/* 用户头像 */}
      <div
        onClick={handleAvatarClick}
        data-avatar-button
        className="relative shrink-0 cursor-pointer transition-all duration-300 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
      >
        <Avatar className="h-8 w-8">
          <AvatarImage src={avatar} alt="Avatar" />
          <AvatarFallback className="bg-gradient-to-br from-violet-500 to-blue-600 text-[10px] font-bold text-white shadow-lg">
            {getAvatarDisplay(avatar || '', username)}
          </AvatarFallback>
        </Avatar>
        {/* 套餐图标 */}
        <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#1e293b] bg-white dark:bg-gray-700 dark:border-gray-600 flex items-center justify-center shadow-sm">
          {currentPlan === 'Free' && <Star className="w-1 h-1 text-purple-500" />}
          {currentPlan === 'Pilot' && <Plane className="w-1 h-1 text-cyan-500" />}
          {currentPlan === 'Maestro' && <Crown className="w-1 h-1 text-amber-500" />}
        </div>
      </div>
    </div>
  )
}
