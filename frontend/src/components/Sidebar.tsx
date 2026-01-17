import { useState, useRef, useEffect } from 'react'
import { Plus, Home, History, FileText, Cog, Settings, Star, Plane, Crown, MessageCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation, type TranslationKey } from '@/i18n'
import { LanguageSelector } from '@/components/LanguageSelector'
import { getAvatarDisplay } from '@/utils/userSettings'
import { ThemeSwitcher } from '@/components/ThemeSwitcher'
import { useLocation, useNavigate } from 'react-router-dom'
import { useChatStore } from '@/store/chatStore'
import { useUserStore } from '@/store/userStore'
import { generateId } from '@/utils/storage'
import PixelLogo from '@/components/PixelLogo'

// 页面类型
export type PageType = 'home' | 'history' | 'knowledge' | 'create-agent' | 'chat'

interface SidebarProps {
  className?: string
  isCollapsed?: boolean
  currentPlan?: 'Free' | 'Pilot' | 'Maestro'
  onCreateAgent?: () => void
  onSettingsClick?: () => void
  onPersonalSettingsClick?: () => void
}

export default function Sidebar({ className, isCollapsed = false, onCreateAgent, onSettingsClick, onPersonalSettingsClick }: SidebarProps) {
  const { t } = useTranslation()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  
  const location = useLocation()
  const navigate = useNavigate()
  const { lastActiveConversationId } = useChatStore()
  const { user } = useUserStore()

  // 用户数据
  const username = user?.username || 'User'
  const avatar = user?.avatar
  // 优先使用 Store 中的 plan，如果没有则默认为 Free
  const currentPlan = (user?.plan as 'Free' | 'Pilot' | 'Maestro') || 'Free'

  // 判断当前页面
  const isOnChat = location.pathname.startsWith('/chat')
  const isOnHome = location.pathname === '/'
  const isOnHistory = location.pathname === '/history'
  const isOnKnowledge = location.pathname === '/knowledge'

  // 点击外部区域关闭弹出菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // 排除头像按钮区域的点击
      const avatarButton = document.querySelector('[data-avatar-button]')
      if (avatarButton && avatarButton.contains(event.target as Node)) {
        return
      }
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false)
      }
    }

    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isMenuOpen])

  // 菜单项 - 去掉对话
  const menuItems = [
    { icon: Home, label: 'home', path: '/', isActive: isOnHome },
    { icon: History, label: 'history', path: '/history', isActive: isOnHistory },
    { icon: FileText, label: 'knowledgeBase', path: '/knowledge', isActive: isOnKnowledge },
  ]

  // 处理菜单项点击
  const handleMenuClick = (path: string) => {
    navigate(path)
    setIsMenuOpen(false)
  }

  const handleBackToChat = () => {
    if (lastActiveConversationId) {
        navigate(`/chat/${lastActiveConversationId}`)
    } else {
        // 如果没有历史会话，创建一个新的会话 ID
        const newId = generateId()
        navigate(`/chat/${newId}`)
    }
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

      {/* 创建智能体按钮 - 圆形 */}
      <div className={cn('px-2 pb-2', isCollapsed && 'lg:hidden')}>
        <button
          onClick={onCreateAgent}
          className="flex items-center justify-center mx-auto w-10 h-10 rounded-full bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-md"
          title={t('createAgent')}
        >
          <Plus className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* 主菜单 - 圆形按钮 */}
      <div className={cn('px-2 pb-2 space-y-2', isCollapsed && 'lg:hidden')}>
        {/* 首页按钮 */}
        <button
          onClick={() => handleMenuClick('/')}
          className={cn(
            'flex items-center justify-center mx-auto w-10 h-10 rounded-full transition-all duration-200',
            isOnHome
              ? 'bg-white text-indigo-600 shadow-[0_0_15px_rgba(139,92,246,0.4)] dark:bg-gray-700 dark:text-white dark:shadow-[0_0_15px_rgba(139,92,246,0.4)]'
              : 'text-slate-400 hover:bg-gray-100/50 hover:text-gray-700 dark:hover:bg-gray-700/50 dark:hover:text-slate-200'
          )}
          title={t('home')}
        >
          <Home className="w-5 h-5 flex-shrink-0" />
        </button>

        {/* 回到上一个会话按钮 */}
        <button
          onClick={handleBackToChat}
          className={cn(
            'flex items-center justify-center mx-auto w-10 h-10 rounded-full transition-all duration-200',
            isOnChat
              ? 'bg-white text-indigo-600 shadow-[0_0_15px_rgba(139,92,246,0.4)] dark:bg-gray-700 dark:text-white dark:shadow-[0_0_15px_rgba(139,92,246,0.4)]'
              : 'text-slate-400 hover:bg-gray-100/50 hover:text-gray-700 dark:hover:bg-gray-700/50 dark:hover:text-slate-200'
          )}
          title={t('backToChat')}
        >
          <MessageCircle className="w-5 h-5 flex-shrink-0" />
        </button>

        {/* 其他菜单项 */}
        {menuItems.filter(item => item.path !== '/').map((item) => (
          <button
            key={item.label}
            onClick={() => handleMenuClick(item.path)}
            className={cn(
              'flex items-center justify-center mx-auto w-10 h-10 rounded-full transition-all duration-200',
              item.isActive
                ? 'bg-white text-indigo-600 shadow-[0_0_15px_rgba(139,92,246,0.4)] dark:bg-gray-700 dark:text-white dark:shadow-[0_0_15px_rgba(139,92,246,0.4)]'
                : 'text-slate-400 hover:bg-gray-100/50 hover:text-gray-700 dark:hover:bg-gray-700/50 dark:hover:text-slate-200'
            )}
            title={t(item.label as TranslationKey)}
          >
            <item.icon className="w-5 h-5 flex-shrink-0" />
          </button>
        ))}
      </div>

      {/* 主题切换 - 头像上方 */}
      <div className="px-2 pb-2">
        <div className="flex items-center justify-center mx-auto w-6 h-6 rounded-full border border-gray-300 bg-gray-200/50 hover:bg-gray-300/50 dark:border-gray-700 dark:bg-gray-800/50 dark:hover:bg-gray-700/50 flex items-center justify-center transition-colors shadow-md">
          <ThemeSwitcher />
        </div>
      </div>

      {/* 底部：Integrated Rounded Cell */}
      <div className="mt-auto mx-3 mb-6 pb-6 backdrop-blur-md">
        {/* 用户一体化容器 */}
        <div
          onClick={(e) => {
            e.stopPropagation()
            setIsMenuOpen(!isMenuOpen)
          }}
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

        {/* 弹出菜单 */}
        {isMenuOpen && (
          <div
            ref={menuRef}
            className="fixed bottom-[60px] left-4 bg-white/85 dark:bg-slate-900/85 backdrop-blur-2xl rounded-2xl shadow-2xl border border-white/40 overflow-hidden z-[100] mb-4 animate-in fade-in zoom-in-95 slide-in-from-bottom-2"
            style={{
              width: '260px',
              maxWidth: 'calc(100vw - 32px)'
            }}
          >
            <div className="p-4">
              {/* 三个权益套餐 - 去边框化，动态背景 */}
              <div className="flex justify-between gap-3 mb-4">
                {/* Free 套餐 */}
                <div className={`relative flex-1`}>
                  <div className={`w-full h-14 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 transition-all flex flex-col items-center justify-center gap-1 ${currentPlan === 'Free' ? 'ring-2 ring-violet-500/30 bg-slate-200/80 dark:bg-white/15' : ''}`}>
                    <div className="relative">
                      <Star className="w-4 h-4 text-slate-400" />
                      {currentPlan === 'Free' && <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-violet-500" />}
                    </div>
                    <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300">Free</span>
                  </div>
                </div>

                {/* Pilot 套餐 */}
                <div className={`relative flex-1`}>
                  <div className={`w-full h-14 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 transition-all flex flex-col items-center justify-center gap-1 ${currentPlan === 'Pilot' ? 'ring-2 ring-cyan-500/40 bg-cyan-500/20' : ''}`}>
                    <div className="relative">
                      <Plane className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                      {currentPlan === 'Pilot' && <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-cyan-500" />}
                    </div>
                    <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300">Pilot</span>
                  </div>
                </div>

                {/* Maestro 套餐 */}
                <div className={`relative flex-1`}>
                  <div className={`w-full h-14 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 transition-all flex flex-col items-center justify-center gap-1 ${currentPlan === 'Maestro' ? 'ring-2 ring-amber-500/40 bg-amber-500/20' : ''}`}>
                    <div className="relative">
                      <Crown className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      {currentPlan === 'Maestro' && <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-amber-500" />}
                    </div>
                    <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300">Maestro</span>
                  </div>
                </div>
              </div>

              {/* 分割线 */}
              <div className="border-t border-slate-200/30 dark:border-white/10 mb-3" />

              {/* 设置项 */}
              <div className="space-y-0.5">
                {/* 个人设置 */}
                <button
                  onClick={() => {
                    onPersonalSettingsClick?.()
                    setIsMenuOpen(false)
                  }}
                  className="w-full flex items-center gap-3 px-2 py-2.5 text-slate-600 dark:text-slate-400 hover:bg-violet-500/10 hover:text-violet-600 dark:hover:text-violet-400 transition-all rounded-lg tracking-wide"
                >
                  <Settings className="w-4 h-4 flex-shrink-0" />
                  <span className="text-[11px] font-medium">{t('personalSettings')}</span>
                </button>

                {/* 模型配置 */}
                <button
                  onClick={onSettingsClick}
                  className="w-full flex items-center gap-3 px-2 py-2.5 text-slate-600 dark:text-slate-400 hover:bg-violet-500/10 hover:text-violet-600 dark:hover:text-violet-400 transition-all rounded-lg tracking-wide"
                >
                  <Cog className="w-4 h-4 flex-shrink-0" />
                  <span className="text-[11px] font-medium">{t('modelConfig')}</span>
                </button>
              </div>

              {/* 分割线 */}
              <div className="border-t border-slate-200/30 dark:border-white/10 mt-3 mb-3" />

              {/* 底部：语言选择靠右 */}
              <div className="flex items-center justify-end">
                <LanguageSelector />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
