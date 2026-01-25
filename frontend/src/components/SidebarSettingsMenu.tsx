import { Settings, Cog, Star, Plane, Crown, LogOut } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useTranslation, type TranslationKey } from '@/i18n'
import { LanguageSelector } from '@/components/LanguageSelector'
import { useUserStore } from '@/store/userStore'
import { cn } from '@/lib/utils'

interface SidebarSettingsMenuProps {
  isOpen: boolean
  onPersonalSettingsClick?: () => void
  onSettingsClick?: () => void
  onMenuClose: () => void
}

export default function SidebarSettingsMenu({ isOpen, onPersonalSettingsClick, onSettingsClick, onMenuClose }: SidebarSettingsMenuProps) {
  const { t } = useTranslation()
  const { user, logout } = useUserStore()
  const menuRef = useRef<HTMLDivElement>(null)

  const handleLogout = () => {
    logout()
    onMenuClose()
  }

  // 优先使用 Store 中的 plan，如果没有则默认为 Free
  const currentPlan = (user?.plan as 'Free' | 'Pilot' | 'Maestro') || 'Free'

  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      // 如果点击的是头像按钮（或其子元素），不关闭菜单
      const avatarButton = document.querySelector('[data-avatar-button]')
      if (avatarButton && avatarButton.contains(event.target as Node)) {
        return
      }

      // 如果点击的是菜单内部，不关闭
      if (menuRef.current && menuRef.current.contains(event.target as Node)) {
        return
      }

      // 点击外部，关闭菜单
      onMenuClose()
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, onMenuClose])

  if (!isOpen) return null

  return (
    <div 
      ref={menuRef}
      className="fixed bottom-[60px] left-4 bg-white/85 dark:bg-slate-900/85 backdrop-blur-2xl rounded-2xl shadow-2xl border border-white/40 overflow-hidden z-[200] mb-4 animate-in fade-in zoom-in-95 slide-in-from-bottom-2"
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
              onMenuClose()
            }}
            className="w-full flex items-center gap-3 px-2 py-2.5 text-slate-600 dark:text-slate-400 hover:bg-violet-500/10 hover:text-violet-600 dark:hover:text-violet-400 transition-all rounded-lg tracking-wide"
          >
            <Settings className="w-4 h-4 flex-shrink-0" />
            <span className="text-[11px] font-medium">{t('personalSettings')}</span>
          </button>

          {/* 模型配置 */}
          <button
            onClick={() => {
              onSettingsClick?.()
              onMenuClose()
            }}
            className="w-full flex items-center gap-3 px-2 py-2.5 text-slate-600 dark:text-slate-400 hover:bg-violet-500/10 hover:text-violet-600 dark:hover:text-violet-400 transition-all rounded-lg tracking-wide"
          >
            <Cog className="w-4 h-4 flex-shrink-0" />
            <span className="text-[11px] font-medium">{t('modelConfig')}</span>
          </button>

          {/* 登出 */}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-2 py-2.5 text-red-500 dark:text-red-400 hover:bg-red-500/10 transition-all rounded-lg tracking-wide"
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            <span className="text-[11px] font-medium">登出</span>
          </button>
        </div>

        {/* 分割线 */}
        <div className="border-t border-slate-200/30 dark:border-white/10 mt-3 mb-3" />

        {/* 底部：语言选择靠右 */}
        <div className="flex items-center justify-end mt-2">
          <LanguageSelector />
        </div>
      </div>
    </div>
  )
}
