import { ReactNode, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Menu, Sun, Moon } from 'lucide-react'
import { BauhausSidebar } from '@/components/bauhaus'
import { SettingsDialog } from '@/components/SettingsDialog'
import { PersonalSettingsDialog } from '@/components/PersonalSettingsDialog'
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog'
import { useApp } from '@/providers/AppProvider'
import { useTheme } from '@/hooks/useTheme'
import { logger } from '@/utils/logger'

interface AppLayoutProps {
  children: ReactNode
  hideMobileMenu?: boolean // 某些页面（如CanvasChatPage）可能不需要汉堡菜单
}

export default function AppLayout({ children, hideMobileMenu = false }: AppLayoutProps) {
  const navigate = useNavigate()
  const { sidebar, dialogs } = useApp()
  const { theme, toggleTheme } = useTheme()

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

  // 确认删除 Agent
  const handleDeleteConfirm = async () => {
    if (!dialogs.deletingAgentId) return

    // 这里只是占位符，实际的删除逻辑由各页面通过订阅 dialogs 状态来处理
    // 或者统一在这里处理
    logger.info('[AppLayout] Delete confirm clicked for:', dialogs.deletingAgentId)
    dialogs.closeDeleteConfirm()
  }

  return (
    <div
      className={cn(
        'flex w-full bg-[var(--bg-page)] dark:bg-[var(--bg-page)] transition-colors duration-200 overflow-x-hidden',
        'min-h-[100dvh]'
      )}
    >
      {/* 网格背景 */}
      <div className="fixed inset-0 pointer-events-none -z-10 bg-[var(--bg-page)] opacity-50" style={{
        backgroundImage: 'radial-gradient(var(--text-secondary) 1.5px, transparent 1.5px)',
        backgroundSize: '32px 32px'
      }} aria-hidden="true" />

      {/* 移动端侧边栏遮罩 */}
      {sidebar.isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={sidebar.closeMobile}
        />
      )}

      {/* Bauhaus 侧边栏 */}
      <aside className={cn(
        'fixed left-0 top-0 h-screen flex-shrink-0 transition-all duration-300 z-[150] border-r-2 border-[var(--border-color)] bg-[var(--bg-card)]',
        sidebar.isCollapsed ? 'w-[72px]' : 'w-[280px]',
        'lg:translate-x-0',
        sidebar.isMobileOpen ? 'translate-x-0' : '-translate-x-full'
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



      {/* 主内容区域 - 右侧交互区 */}
      <div className={cn(
        'flex-1 w-full flex flex-col transition-all duration-300',
        sidebar.isCollapsed ? 'lg:ml-[72px]' : 'lg:ml-[280px]',
        sidebar.isMobileOpen ? 'ml-0' : 'ml-0'
      )}>
        {/* 移动端汉堡菜单按钮 - Bauhaus 风格 */}
        {!hideMobileMenu && (
          <div className="lg:hidden absolute top-4 left-4 z-50">
            <button
              onClick={sidebar.toggleMobile}
              className="p-2 border-2 border-[var(--border-color)] bg-[var(--bg-card)] shadow-[var(--shadow-color)_4px_4px_0_0] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[var(--accent-hover)_2px_2px_0_0]"
            >
              <Menu className="w-5 h-5 stroke-[2.5]" />
            </button>
          </div>
        )}

        {/* 主要内容 */}
        <main className="flex-1 w-full flex flex-col h-full overflow-hidden">
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

      <DeleteConfirmDialog
        isOpen={dialogs.deleteConfirmOpen}
        onClose={dialogs.closeDeleteConfirm}
        onConfirm={handleDeleteConfirm}
        title="确认删除智能体"
        description="删除后无法恢复，请确认是否继续？"
        itemName={dialogs.deletingAgentName}
      />

      {/* 主题切换按钮 - Bauhaus风格 */}
      <div className="fixed bottom-8 right-8 z-50">
        <button
          onClick={toggleTheme}
          className="w-12 h-12 flex items-center justify-center rounded-full border-2 border-[var(--border-color)] bg-[var(--bg-card)] shadow-[var(--shadow-color)_4px_4px_0_0] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[var(--accent-hover)_2px_2px_0_0] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all"
          title={theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'}
        >
          {theme === 'dark' ? (
            <Sun className="w-5 h-5 stroke-[2.5]" />
          ) : (
            <Moon className="w-5 h-5 stroke-[2.5]" />
          )}
        </button>
      </div>
    </div>
  )
}


