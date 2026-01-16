import { useState, useEffect } from 'react'
import { ReactNode } from 'react'
import Sidebar from './Sidebar'
import { cn } from '@/lib/utils'
import { Menu, ChevronLeft, ChevronRight } from 'lucide-react'

interface MainChatLayoutProps {
  children: ReactNode
  className?: string
  hasMessages?: boolean
  onCreateAgent?: () => void
  onSettingsClick?: () => void
  onPersonalSettingsClick?: () => void
}

export default function MainChatLayout({ children, className, hasMessages = false, onCreateAgent, onSettingsClick, onPersonalSettingsClick }: MainChatLayoutProps) {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)
  const [isDesktopSidebarCollapsed, setIsDesktopSidebarCollapsed] = useState(false)

  // 监听来自Sidebar的收拢/展开事件
  useEffect(() => {
    const handleToggle = () => {
      setIsDesktopSidebarCollapsed(prev => !prev)
    }
    window.addEventListener('toggle-sidebar', handleToggle)
    return () => window.removeEventListener('toggle-sidebar', handleToggle)
  }, [])

  return (
    <div 
      className={cn(
        'flex bg-background transition-colors duration-200',
        // 使用 overflow-y-scroll 强制显示滚动条轨道，防止 Windows 下内容切换导致的布局跳动
        hasMessages ? 'h-screen overflow-hidden' : 'min-h-screen overflow-y-scroll'
      )}
    >
      {/* 移动端侧边栏遮罩 */}
      {isMobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}

      {/* 左侧边栏 */}
      <div className={cn(
        'fixed left-0 top-0 h-screen w-[92px] text-gray-600 flex flex-col border-r transition-transform duration-200 z-50',
        'bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-gray-200/50 dark:border-gray-800/50',
        'lg:translate-x-0',
        isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full',
        isDesktopSidebarCollapsed && 'lg:-translate-x-full',
      )}>
        <Sidebar
          isCollapsed={isDesktopSidebarCollapsed}
          currentPlan="Free"
          onCreateAgent={onCreateAgent}
          onSettingsClick={onSettingsClick}
          onPersonalSettingsClick={onPersonalSettingsClick}
        />
      </div>

      {/* 收拢/展开按钮 - 与头像水平对齐 */}
      <div className={cn(
        'fixed bottom-[55px] z-50 transition-all duration-200 lg:flex hidden',
        isDesktopSidebarCollapsed ? 'left-[12px]' : 'left-[92px]'
      )}>
        {/* 收拢/展开侧边栏按钮 */}
        <button
          onClick={() => setIsDesktopSidebarCollapsed(!isDesktopSidebarCollapsed)}
          className="w-6 h-6 rounded-full border border-gray-300 bg-gray-200/50 hover:bg-gray-300/50 dark:border-gray-700 dark:bg-gray-800/50 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-200 flex items-center justify-center transition-colors shadow-md"
          title={isDesktopSidebarCollapsed ? '展开侧边栏' : '收拢侧边栏'}
        >
          {isDesktopSidebarCollapsed ? (
            <ChevronRight className="w-3 h-3" />
          ) : (
            <ChevronLeft className="w-3 h-3" />
          )}
        </button>
      </div>

      {/* 主内容区域 - 添加左边距和移动端适配 */}
      <div className={cn(
        'flex-1 flex flex-col transition-all duration-200',
        hasMessages ? 'h-full' : 'min-h-screen',
        isDesktopSidebarCollapsed ? 'lg:ml-0' : 'lg:ml-[92px]',
        isMobileSidebarOpen ? 'ml-0' : 'ml-0'
      )}>
        {/* 移动端汉堡菜单按钮 */}
        <div className="lg:hidden p-4">
          <button
            onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
            className="p-2 rounded-lg hover:bg-gray-100/50 dark:hover:bg-gray-800/50 transition-colors"
          >
            <Menu className="w-6 h-6 text-gray-600 dark:text-gray-400" />
          </button>
        </div>

        {/* 主要内容 */}
        <main className={cn('flex-1 overflow-hidden flex flex-col', className)}>
          {children}
        </main>
      </div>
    </div>
  )
}
