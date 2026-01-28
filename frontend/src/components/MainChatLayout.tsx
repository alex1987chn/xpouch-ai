import { useState, useEffect } from 'react'
import { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Menu, ChevronLeft, ChevronRight } from 'lucide-react'
import { BauhausSidebar } from '@/components/bauhaus'

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
        'flex w-full bg-[var(--bg-page)] dark:bg-[var(--bg-page)] transition-colors duration-200 overflow-x-hidden',
        // 只有在其他页面（非首页）时才固定高度
        hasMessages ? 'h-[100dvh]' : 'min-h-[100dvh]'
      )}
    >
      {/* 移动端侧边栏遮罩 */}
      {isMobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}

      {/* 左侧边栏 - Bauhaus 风格 */}
      <aside className={cn(
        'fixed left-0 top-0 h-screen flex-shrink-0 transition-all duration-300 z-[150]',
        'border-r-2 border-[var(--border-color)] bg-[var(--bg-card)]',
        isDesktopSidebarCollapsed ? 'w-[72px]' : 'w-[280px]',
        'lg:translate-x-0',
        isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full',
      )}>
        <div className="h-full w-full">
          <BauhausSidebar
            isCollapsed={isDesktopSidebarCollapsed}
            isMobileOpen={isMobileSidebarOpen}
            onMobileClose={() => setIsMobileSidebarOpen(false)}
            onCreateAgent={onCreateAgent}
            onSettingsClick={onSettingsClick}
            onPersonalSettingsClick={onPersonalSettingsClick}
            onToggleCollapsed={() => setIsDesktopSidebarCollapsed(!isDesktopSidebarCollapsed)}
          />
        </div>
      </aside>

      {/* 收拢/展开按钮 */}
      <div className={cn(
        'fixed bottom-4 z-50 transition-all duration-300 lg:flex hidden',
        isDesktopSidebarCollapsed ? 'left-[72px]' : 'left-[280px]'
      )}>
        {/* 收拢/展开侧边栏按钮 - Bauhaus风格 */}
        <button
          onClick={() => setIsDesktopSidebarCollapsed(!isDesktopSidebarCollapsed)}
          className="p-1.5 border-2 border-[var(--border-color)] bg-[var(--bg-page)] shadow-[var(--shadow-color)_2px_2px_0_0] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[var(--shadow-color)_3px_3px_0_0]"
          title={isDesktopSidebarCollapsed ? '展开侧边栏' : '收拢侧边栏'}
        >
          {isDesktopSidebarCollapsed ? (
            <ChevronRight className="w-3.5 h-3.5" />
          ) : (
            <ChevronLeft className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* 主内容区域 */}
      <div className={cn(
        'flex-1 w-full flex flex-col transition-all duration-300',
        isDesktopSidebarCollapsed ? 'lg:ml-[72px]' : 'lg:ml-[280px]',
        isMobileSidebarOpen ? 'ml-0' : 'ml-0'
      )}>
        {/* 移动端汉堡菜单按钮 - Bauhaus风格 */}
        <div className="lg:hidden absolute top-4 left-4 z-50">
          <button
            onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
            className="p-2 border-2 border-[var(--border-color)] bg-[var(--bg-card)] shadow-[var(--shadow-color)_4px_4px_0_0] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[var(--accent-hover)_2px_2px_0_0]"
          >
            <Menu className="w-5 h-5 stroke-[2.5]" />
          </button>
        </div>

        {/* 主要内容 */}
        <main className={cn('flex-1 w-full flex flex-col', className)}>
          {children}
        </main>
      </div>
    </div>
  )
}
