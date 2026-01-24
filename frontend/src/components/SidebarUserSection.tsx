import { useState } from 'react'
import { Star, Plane, Crown, User } from 'lucide-react'
import { getAvatarDisplay } from '@/utils/userSettings'
import { useUserStore } from '@/store/userStore'
import { cn } from '@/lib/utils'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import LoginDialog from '@/components/LoginDialog'

interface SidebarUserSectionProps {
  isCollapsed?: boolean
  onPersonalSettingsClick?: () => void
  onMenuOpenChange: (isOpen: boolean) => void
}

export default function SidebarUserSection({ isCollapsed = false, onPersonalSettingsClick, onMenuOpenChange }: SidebarUserSectionProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [showLoginDialog, setShowLoginDialog] = useState(false)
  const { user, isAuthenticated } = useUserStore()

  // 用户数据
  const username = user?.username || 'User'
  const avatar = user?.avatar
  // 优先使用 Store 中的 plan，如果没有则默认为 Free
  const currentPlan = (user?.plan as 'Free' | 'Pilot' | 'Maestro') || 'Free'

  // 套餐权益文案
  const planLabel = {
    'Free': '免费版',
    'Pilot': '专业版',
    'Maestro': '企业版'
  }[currentPlan]

  const handleAvatarClick = () => {
    setIsMenuOpen(!isMenuOpen)
    onMenuOpenChange(!isMenuOpen)
  }

  const handleLoginClick = () => {
    setShowLoginDialog(true)
  }

  // 未登录状态：显示登录按钮
  if (!isAuthenticated || !user) {
    return (
      <div className={cn('backdrop-blur-md', !isCollapsed && 'w-full')}>
        {isCollapsed ? (
          <div
            onClick={handleLoginClick}
            className="flex items-center justify-center cursor-pointer transition-all duration-200 hover:bg-indigo-50 dark:hover:bg-white/10 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
          >
            <User className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </div>
        ) : (
          <Button
            onClick={handleLoginClick}
            variant="ghost"
            className="w-full h-9 px-3 justify-start gap-2 text-sm font-medium"
          >
            <User className="w-4 h-4" />
            <span>登录</span>
          </Button>
        )}
        
        <LoginDialog
          open={showLoginDialog}
          onOpenChange={setShowLoginDialog}
          onSuccess={() => {
            // 登录成功后刷新用户信息
            onMenuOpenChange(false)
          }}
        />
      </div>
    )
  }

  return (
    <div className={cn(
      'backdrop-blur-md',
      !isCollapsed && 'w-full'
    )}>
      {isCollapsed ? (
        <div
          onClick={handleAvatarClick}
          data-avatar-button=""
          className="flex items-center justify-center cursor-pointer transition-all duration-200 hover:bg-indigo-50 dark:hover:bg-white/10 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
        >
          <Avatar className="h-8 w-8">
            <AvatarImage src={avatar} alt="Avatar" />
            <AvatarFallback className="bg-gradient-to-br from-violet-500 to-blue-600 text-[10px] font-bold text-white shadow-lg">
              {getAvatarDisplay(avatar || '', username)}
            </AvatarFallback>
          </Avatar>
        </div>
      ) : (
        <div
          onClick={handleAvatarClick}
          data-avatar-button=""
          className="flex items-center gap-2 cursor-pointer transition-all duration-200 hover:bg-indigo-50 dark:hover:bg-white/10 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
        >
          <div className="relative shrink-0">
            <Avatar className="h-7 w-7">
              <AvatarImage src={avatar} alt="Avatar" />
              <AvatarFallback className="bg-gradient-to-br from-violet-500 to-blue-600 text-[10px] font-bold text-white shadow-lg">
                {getAvatarDisplay(avatar || '', username)}
              </AvatarFallback>
            </Avatar>
            {/* 套餐图标 */}
            <div className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white dark:border-slate-800 bg-white dark:bg-slate-800 flex items-center justify-center shadow-sm">
              {currentPlan === 'Free' && <Star className="w-0.5 h-0.5 text-purple-500" />}
              {currentPlan === 'Pilot' && <Plane className="w-0.5 h-0.5 text-cyan-500" />}
              {currentPlan === 'Maestro' && <Crown className="w-0.5 h-0.5 text-amber-500" />}
            </div>
          </div>
          {/* 名字和权益 */}
          <div className="flex flex-col min-w-0">
            <span
              className="text-xs font-medium text-gray-700 dark:text-white/90 truncate leading-tight"
              title={username}
            >
              {username.length > 4 ? username.substring(0, 4) + '...' : username}
            </span>
            <span className="text-[10px] text-gray-500 dark:text-slate-400 truncate leading-tight">
              {planLabel}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
