import { Home, History, FileText } from 'lucide-react'
import { useTranslation, type TranslationKey } from '@/i18n'
import { useLocation, useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface SidebarMenuProps {
  isCollapsed?: boolean
  onCreateAgent?: () => void
}

export default function SidebarMenu({ isCollapsed = false, onCreateAgent }: SidebarMenuProps) {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()

  // 判断当前页面
  const isOnHome = location.pathname === '/'
  const isOnKnowledge = location.pathname === '/knowledge'
  const isOnHistory = location.pathname === '/history'

  // 处理菜单项点击
  const handleMenuClick = (path: string) => {
    navigate(path)
  }

  return (
    <>
      {/* 创建智能体按钮 - 圆形 */}
      <div className={cn('px-1.5 pb-1.5', isCollapsed && 'lg:hidden')}>
        <Button
          onClick={onCreateAgent}
          variant="default"
          size="icon"
          className="mx-auto w-8 h-8 rounded-full bg-indigo-600 hover:bg-indigo-700 shadow-md"
          title={t('createAgent')}
        >
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14m-7-7h14M5 12h14" />
          </svg>
        </Button>
      </div>

      {/* 主菜单 - 圆形按钮 */}
      <div className={cn('px-1.5 pb-1.5 space-y-2.5', isCollapsed && 'lg:hidden')}>
        {/* 首页按钮 */}
        <Button
          onClick={() => handleMenuClick('/')}
          variant={isOnHome ? 'default' : 'ghost'}
          size="icon"
          className={cn(
            'mx-auto w-8 h-8 rounded-full transition-all duration-200',
            isOnHome
              ? 'bg-white text-indigo-600 shadow-[0_0_15px_rgba(139,92,246,0.4)] dark:bg-gray-700 dark:text-white dark:shadow-[0_0_15px_rgba(139,92,246,0.4)]'
              : 'text-slate-400 hover:bg-gray-100/50 hover:text-gray-700 dark:hover:bg-gray-700/50 dark:hover:text-slate-200'
          )}
          title={t('home')}
        >
          <Home className="w-4 h-4 flex-shrink-0" />
        </Button>

        <Button
          onClick={() => handleMenuClick('/knowledge')}
          variant={isOnKnowledge ? 'default' : 'ghost'}
          size="icon"
          className={cn(
            'mx-auto w-8 h-8 rounded-full transition-all duration-200',
            isOnKnowledge
              ? 'bg-white text-indigo-600 shadow-[0_0_15px_rgba(139,92,246,0.4)] dark:bg-gray-700 dark:text-white dark:shadow-[0_0_15px_rgba(139,92,246,0.4)]'
              : 'text-slate-400 hover:bg-gray-100/50 hover:text-gray-700 dark:hover:bg-gray-700/50 dark:hover:text-slate-200'
          )}
          title={t('knowledgeBase')}
        >
          <FileText className="w-4 h-4 flex-shrink-0" />
        </Button>

        {/* 历史记录按钮 */}
        <Button
          onClick={() => handleMenuClick('/history')}
          variant={isOnHistory ? 'default' : 'ghost'}
          size="icon"
          className={cn(
            'mx-auto w-8 h-8 rounded-full transition-all duration-200',
            isOnHistory
              ? 'bg-white text-indigo-600 shadow-[0_0_15px_rgba(139,92,246,0.4)] dark:bg-gray-700 dark:text-white dark:shadow-[0_0_15px_rgba(139,92,246,0.4)]'
              : 'text-slate-400 hover:bg-gray-100/50 hover:text-gray-700 dark:hover:bg-gray-700/50 dark:hover:text-slate-200'
          )}
          title={t('history')}
        >
          <History className="w-4 h-4 flex-shrink-0" />
        </Button>
      </div>
    </>
  )
}
