import { ReactNode, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Menu, ChevronLeft, ChevronRight } from 'lucide-react'
import { BauhausSidebar } from '@/components/bauhaus'
import { useApp } from '@/providers/AppProvider'
import { SettingsDialog } from '@/components/SettingsDialog'
import { PersonalSettingsDialog } from '@/components/PersonalSettingsDialog'



interface AppRootProps {
  children: ReactNode
}

export default function AppRoot({ children }: AppRootProps) {
  const navigate = useNavigate()
  const { sidebar, dialogs } = useApp()

  // 监听全局 toggle-sidebar 事件
  useEffect(() => {
    const handleToggle = () => {
      sidebar.toggleCollapsed()
    }
    window.addEventListener('toggle-sidebar', handleToggle)
    return () => window.removeEventListener('toggle-sidebar', handleToggle)
  }, [sidebar])

  // 创建 Agent 的回调
  const handleCreateAgent = () => {
    navigate('/create-agent')
  }

  return (
    <div
      className={cn(
        'flex w-full bg-[var(--bg-page)] dark:bg-[var(--bg-page)] transition-colors duration-200 overflow-x-hidden',
        'min-h-[100dvh]'
      )}
    >
      {/* 移动端侧边栏遮罩 */}
      {sidebar.isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={sidebar.closeMobile}
        />
      )}

      {/* 左侧边栏 - Bauhaus 风格 */}
      <aside className={cn(
        'fixed left-0 top-0 h-screen flex-shrink-0 transition-all duration-300 z-[150]',
        'border-r-2 border-[var(--border-color)] bg-[var(--bg-card)]',
        sidebar.isCollapsed ? 'w-[72px]' : 'w-[280px]',
        'lg:translate-x-0',
        sidebar.isMobileOpen ? 'translate-x-0' : '-translate-x-full',
      )}>
        <div className="h-full w-full">
          <BauhausSidebar
            isCollapsed={sidebar.isCollapsed}
            isMobileOpen={sidebar.isMobileOpen}
            onMobileClose={sidebar.closeMobile}
            onCreateAgent={handleCreateAgent}
            onSettingsClick={dialogs.openSettings}
            onPersonalSettingsClick={dialogs.openPersonalSettings}
            onToggleCollapsed={sidebar.toggleCollapsed}
          />
        </div>
      </aside>

      {/* 收拢/展开按钮 */}
      <div className={cn(
        'fixed bottom-4 z-50 transition-all duration-300 lg:flex hidden',
        sidebar.isCollapsed ? 'left-[72px]' : 'left-[280px]'
      )}>
        {/* 收拢/展开侧边栏按钮 - Bauhaus风格 */}
        <button
          onClick={sidebar.toggleCollapsed}
          className="p-1.5 border-2 border-[var(--border-color)] bg-[var(--bg-page)] shadow-[var(--shadow-color)_2px_2px_0_0] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[var(--shadow-color)_3px_3px_0_0]"
          title={sidebar.isCollapsed ? '展开侧边栏' : '收拢侧边栏'}
        >
          {sidebar.isCollapsed ? (
            <ChevronRight className="w-3.5 h-3.5" />
          ) : (
            <ChevronLeft className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* 主内容区域 */}
      <div className={cn(
        'flex-1 w-full flex flex-col transition-all duration-300',
        sidebar.isCollapsed ? 'lg:ml-[72px]' : 'lg:ml-[280px]',
        sidebar.isMobileOpen ? 'ml-0' : 'ml-0'
      )}>
        {/* 移动端汉堡菜单按钮 - Bauhaus风格 */}
        <div className="lg:hidden absolute top-4 left-4 z-50">
          <button
            onClick={sidebar.toggleMobile}
            className="p-2 border-2 border-[var(--border-color)] bg-[var(--bg-card)] shadow-[var(--shadow-color)_4px_4px_0_0] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[var(--accent-hover)_2px_2px_0_0]"
          >
            <Menu className="w-5 h-5 stroke-[2.5]" />
          </button>
        </div>

        {/* 主要内容 */}
        <main className="flex-1 w-full flex flex-col">
          {children}
        </main>
      </div>

      {/* 全局 Dialogs */}
      <SettingsDialog
        isOpen={dialogs.settingsOpen}
        onClose={dialogs.closeSettings}
      />

      <PersonalSettingsDialog
        isOpen={dialogs.personalSettingsOpen}
        onClose={dialogs.closePersonalSettings}
      />
    </div>
  )
}
