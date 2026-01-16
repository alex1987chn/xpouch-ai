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
        // 如果没有历史会话，创建一个新的
        navigate('/chat/new')
    }
  }

  return (
    <div className={cn(
      'w-full h-full text-gray-600 flex flex-col',
      className
    )}>
      {/* Logo 区域 - 固定宽度保持大小 */}
      <div className="p-3 pb-4 flex items-center justify-center">
        <img
          src="/logo.png"
          alt="XPouch AI Logo"
          className="h-8 w-[80px] object-contain cursor-pointer"
          onClick={() => navigate('/')}
        />
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
              ? 'bg-white text-indigo-600 shadow-sm dark:bg-gray-700 dark:text-indigo-400'
              : 'text-gray-600 hover:bg-gray-100/50 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700/50 dark:hover:text-gray-200'
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
              ? 'bg-white text-indigo-600 shadow-sm dark:bg-gray-700 dark:text-indigo-400'
              : 'text-gray-600 hover:bg-gray-100/50 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700/50 dark:hover:text-gray-200'
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
                ? 'bg-white text-indigo-600 shadow-sm dark:bg-gray-700 dark:text-indigo-400'
                : 'text-gray-600 hover:bg-gray-100/50 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700/50 dark:hover:text-gray-200'
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

      {/* 底部：头像 */}
      <div className={cn('mt-auto px-2 pb-3 border-t border-gray-200/50 dark:border-gray-700/50 relative h-[80px]', isCollapsed && 'lg:hidden')}>
        {/* 用户头像 - 居中定位 */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            setIsMenuOpen(!isMenuOpen)
          }}
          data-avatar-button
          className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 flex items-center justify-center rounded-lg hover:bg-gray-100/50 dark:hover:bg-gray-800/50 transition-colors"
        >
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white text-sm font-medium flex-shrink-0 overflow-hidden border-2 border-white dark:border-gray-600">
              {avatar ? (
                <img
                  src={avatar}
                  alt="Avatar"
                  className="w-full h-full object-cover"
                />
              ) : (
                getAvatarDisplay(avatar || '', username)
              )}
            </div>
            <div className="absolute -right-1 -bottom-1 w-3.5 h-3.5 rounded-full bg-white dark:bg-gray-700 border border-white dark:border-gray-600 flex items-center justify-center">
              {currentPlan === 'Free' && <Star className="w-2 h-2 text-purple-500" />}
              {currentPlan === 'Pilot' && <Plane className="w-2 h-2 text-cyan-500" />}
              {currentPlan === 'Maestro' && <Crown className="w-2 h-2 text-amber-500" />}
            </div>
          </div>
        </button>

        {/* 弹出菜单 */}
        {isMenuOpen && (
          <div
            ref={menuRef}
            className="fixed bottom-[80px] left-4 bg-white/95 dark:bg-gray-800/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/40 dark:border-gray-700/40 overflow-visible z-50 animate-in fade-in slide-in-from-bottom-2 duration-200"
            style={{ width: '260px', maxWidth: 'calc(100vw - 32px)' }}
          >
            <div className="p-4">
              {/* 顶部：头像和用户名 */}
              <div className="flex items-center gap-3 pb-4 border-b border-gray-200/50 dark:border-gray-700/50 mb-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white text-base font-medium flex-shrink-0 overflow-hidden border-2 border-white dark:border-gray-600 shadow-sm">
                  {avatar ? (
                    <img
                      src={avatar}
                      alt="Avatar"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    getAvatarDisplay(avatar || '', username)
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{username}</span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t('personalSettings')}</span>
                </div>
              </div>

              {/* 三个权益套餐 - 居中分布，自动填充 */}
              <div className="flex justify-between gap-3 mb-4">
                {/* Free 套餐 */}
                <div className="relative group/套餐 flex-1">
                  <button className="w-full h-14 rounded-xl bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-all border border-blue-200 dark:border-blue-700 flex flex-col items-center justify-center gap-1">
                    <Star className="w-4 h-4 text-purple-500" />
                    <span className="text-[10px] font-bold text-gray-800 dark:text-gray-200">Free</span>
                  </button>
                  {/* Hover 显示权益内容 */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-gray-900 dark:bg-gray-700 text-white rounded-lg shadow-lg opacity-0 pointer-events-none transition-all duration-200 translate-y-1 group-hover/套餐:opacity-100 group-hover/套餐:translate-y-0 group-hover/套餐:pointer-events-auto z-50">
                    <p className="text-[10px] font-medium whitespace-nowrap">基础AI · 每日50条</p>
                    <div className="absolute bottom-[-4px] left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 dark:bg-gray-700 rotate-45" />
                  </div>
                </div>

                {/* Pilot 套餐 */}
                <div className="relative group/套餐 flex-1">
                  <button className="w-full h-14 rounded-xl bg-cyan-50 dark:bg-cyan-900/30 hover:bg-cyan-100 dark:hover:bg-cyan-900/50 transition-all border border-cyan-200 dark:border-cyan-700 flex flex-col items-center justify-center gap-1">
                    <Plane className="w-4 h-4 text-cyan-500" />
                    <span className="text-[10px] font-bold text-gray-800 dark:text-gray-200">Pilot</span>
                  </button>
                  {/* Hover 显示权益内容 */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-gray-900 dark:bg-gray-700 text-white rounded-lg shadow-lg opacity-0 pointer-events-none transition-all duration-200 translate-y-1 group-hover/套餐:opacity-100 group-hover/套餐:translate-y-0 group-hover/套餐:pointer-events-auto z-50">
                    <p className="text-[10px] font-medium whitespace-nowrap">进阶AI · 无限对话</p>
                    <div className="absolute bottom-[-4px] left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 dark:bg-gray-700 rotate-45" />
                  </div>
                </div>

                {/* Maestro 套餐 */}
                <div className="relative group/套餐 flex-1">
                  <button className="w-full h-14 rounded-xl bg-amber-50 dark:bg-amber-900/30 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-all border border-amber-200 dark:border-amber-700 flex flex-col items-center justify-center gap-1">
                    <Crown className="w-4 h-4 text-amber-500" />
                    <span className="text-[10px] font-bold text-gray-800 dark:text-gray-200">Maestro</span>
                  </button>
                  {/* Hover 显示权益内容 */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-gray-900 dark:bg-gray-700 text-white rounded-lg shadow-lg opacity-0 pointer-events-none transition-all duration-200 translate-y-1 group-hover/套餐:opacity-100 group-hover/套餐:translate-y-0 group-hover/套餐:pointer-events-auto z-50">
                    <p className="text-[10px] font-medium whitespace-nowrap">大师AI · 自定义训练</p>
                    <div className="absolute bottom-[-4px] left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 dark:bg-gray-700 rotate-45" />
                  </div>
                </div>
              </div>

              {/* 设置项 */}
              <div className="space-y-1">
                {/* 个人设置 */}
                <button
                  onClick={() => {
                    onPersonalSettingsClick?.()
                    setIsMenuOpen(false)
                  }}
                  className="w-full flex items-center gap-2 px-1 py-1.5 text-gray-700 dark:text-gray-200 hover:bg-gray-100/50 dark:hover:bg-gray-700/50 transition-colors rounded-lg"
                >
                  <div className="w-5 h-5 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-600 flex items-center justify-center flex-shrink-0">
                    <Settings className="w-2.5 h-2.5 text-gray-600 dark:text-gray-300" />
                  </div>
                  <span className="text-[10px]">{t('personalSettings')}</span>
                </button>

                {/* 模型配置 */}
                <button
                  onClick={onSettingsClick}
                  className="w-full flex items-center gap-2 px-1 py-1.5 text-gray-700 dark:text-gray-200 hover:bg-gray-100/50 dark:hover:bg-gray-700/50 transition-colors rounded-lg"
                >
                  <div className="w-5 h-5 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900 dark:to-purple-900 flex items-center justify-center flex-shrink-0">
                    <Cog className="w-2.5 h-2.5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <span className="text-[10px]">{t('modelConfig')}</span>
                </button>
              </div>

              {/* 底部：语言选择靠右 */}
              <div className="flex items-center justify-end mt-2 pt-2 border-t border-gray-200/50">
                <LanguageSelector />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
