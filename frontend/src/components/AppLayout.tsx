import { ReactNode, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Menu, ChevronRight } from 'lucide-react'
import Sidebar from '@/components/Sidebar'
import { SettingsDialog } from '@/components/SettingsDialog'
import { PersonalSettingsDialog } from '@/components/PersonalSettingsDialog'
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog'
import { useApp } from '@/providers/AppProvider'

interface AppLayoutProps {
  children: ReactNode
  hideMobileMenu?: boolean // 某些页面（如CanvasChatPage）可能不需要汉堡菜单
}

export default function AppLayout({ children, hideMobileMenu = false }: AppLayoutProps) {
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

  // 确认删除 Agent
  const handleDeleteConfirm = async () => {
    if (!dialogs.deletingAgentId) return

    // 这里只是占位符，实际的删除逻辑由各页面通过订阅 dialogs 状态来处理
    // 或者统一在这里处理
    console.log('[AppLayout] Delete confirm clicked for:', dialogs.deletingAgentId)
    dialogs.closeDeleteConfirm()
  }

  return (
    <div
      className={cn(
        'flex w-full bg-slate-50 dark:bg-[#020617] transition-colors duration-200 overflow-x-hidden',
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

      {/* 左侧边栏 - 统一的全局 Sidebar */}
      <aside className={cn(
        'fixed left-0 top-0 h-screen flex-shrink-0 transition-all duration-300 z-[150]',
        sidebar.isCollapsed ? 'w-[72px]' : 'w-[240px]',
        'bg-gradient-to-b from-white via-gray-50 to-gray-100 dark:from-[#1e293b] dark:via-[#1a1d2e] dark:to-[#0d0f14]',
        'backdrop-blur-xl',
        'border-r border-gray-100 dark:border-white/5',
        'lg:translate-x-0',
        sidebar.isMobileOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        <div className="h-full w-full">
          <Sidebar
            isCollapsed={sidebar.isCollapsed}
            onCreateAgent={handleCreateAgent}
            onSettingsClick={dialogs.openSettings}
            onPersonalSettingsClick={dialogs.openPersonalSettings}
          />
        </div>
      </aside>

      {/* 侧边栏切换按钮 - 固定在侧边栏右边缘（参考 ChatGPT/DeepSeek 设计） */}
      <div className={cn(
        'fixed top-4 z-50 hidden lg:flex transition-all duration-300',
        sidebar.isCollapsed ? 'left-[72px]' : 'left-[240px]'
      )}>
        <button
          onClick={sidebar.toggleCollapsed}
          className={cn(
            'flex items-center justify-center w-8 h-8 rounded-full transition-all duration-200',
            sidebar.isCollapsed
              ? 'bg-gray-200/80 dark:bg-gray-800/80 hover:bg-gray-300/80 dark:hover:bg-gray-700/80 hover:scale-110'
              : 'bg-white/90 dark:bg-slate-900/90 hover:bg-gray-100/90 dark:hover:bg-slate-800/90 hover:scale-105',
            'backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-violet-500/50 shadow-lg text-gray-600 dark:text-gray-300'
          )}
          title={sidebar.isCollapsed ? '展开侧边栏' : '收拢侧边栏'}
        >
          {sidebar.isCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4 rotate-180" />
          )}
        </button>
      </div>

      {/* 主内容区域 - 右侧交互区 */}
      <div className={cn(
        'flex-1 w-full flex flex-col transition-all duration-300',
        sidebar.isCollapsed ? 'lg:ml-[72px]' : 'lg:ml-[240px]',
        sidebar.isMobileOpen ? 'ml-0' : 'ml-0'
      )}>
        {/* 移动端汉堡菜单按钮 */}
        {!hideMobileMenu && (
          <div className="lg:hidden absolute top-4 left-4 z-50">
            <button
              onClick={sidebar.toggleMobile}
              className="p-2 rounded-lg bg-white/80 dark:bg-slate-800/80 backdrop-blur-md hover:bg-gray-100/50 dark:hover:bg-slate-700/50 transition-colors shadow-md"
            >
              <Menu className="w-6 h-6 text-gray-600 dark:text-gray-400" />
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
    </div>
  )
}


