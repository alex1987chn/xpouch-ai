import { ReactNode, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Menu, ChevronLeft, ChevronRight } from 'lucide-react'
import Sidebar from '@/components/Sidebar'
import { useApp } from '@/providers/AppProvider'
import { SettingsDialog } from '@/components/SettingsDialog'
import { PersonalSettingsDialog } from '@/components/PersonalSettingsDialog'
import { useChatStore } from '@/store/chatStore'

interface AppRootProps {
  children: ReactNode
}

export default function AppRoot({ children }: AppRootProps) {
  const navigate = useNavigate()
  const { sidebar, dialogs } = useApp()
  // const { addCustomAgent } = useChatStore() // Unused

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

      {/* 左侧边栏 - 统一样式，全局层级 */}
      <aside className={cn(
        'fixed left-0 top-0 h-screen flex-shrink-0 transition-transform duration-200 z-[150]',
        'w-[64px]',
        'bg-gradient-to-b from-slate-700 to-slate-900 dark:from-[#1e293b] dark:to-[#0f172a]',
        'backdrop-blur-xl',
        'border-r border-slate-200/50 dark:border-slate-700/30',
        'lg:translate-x-0',
        sidebar.isMobileOpen ? 'translate-x-0' : '-translate-x-full',
        sidebar.isCollapsed && 'lg:-translate-x-full',
      )}>
        <div className="h-full w-full">
          <Sidebar
            isCollapsed={sidebar.isCollapsed}
            currentPlan="Free"
            onCreateAgent={handleCreateAgent}
            onSettingsClick={dialogs.openSettings}
            onPersonalSettingsClick={dialogs.openPersonalSettings}
          />
        </div>
      </aside>

      {/* 收拢/展开按钮 - 与头像水平对齐 */}
      <div className={cn(
        'fixed bottom-[55px] z-50 transition-all duration-200 lg:flex hidden',
        sidebar.isCollapsed ? 'left-[12px]' : 'left-[64px]'
      )}>
        {/* 收拢/展开侧边栏按钮 */}
        <button
          onClick={sidebar.toggleCollapsed}
          className="w-6 h-6 rounded-full border border-gray-300 bg-gray-200/50 hover:bg-gray-300/50 dark:border-gray-700 dark:bg-gray-800/50 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-200 flex items-center justify-center transition-colors shadow-md"
          title={sidebar.isCollapsed ? '展开侧边栏' : '收拢侧边栏'}
        >
          {sidebar.isCollapsed ? (
            <ChevronRight className="w-3 h-3" />
          ) : (
            <ChevronLeft className="w-3 h-3" />
          )}
        </button>
      </div>

      {/* 主内容区域 - 添加左边距和移动端适配 */}
      <div className={cn(
        'flex-1 w-full flex flex-col transition-all duration-200',
        sidebar.isCollapsed ? 'lg:ml-0' : 'lg:ml-[64px]',
        sidebar.isMobileOpen ? 'ml-0' : 'ml-0'
      )}>
        {/* 移动端汉堡菜单按钮 - 不占用主内容区空间 */}
        <div className="lg:hidden absolute top-4 left-4 z-50">
          <button
            onClick={sidebar.toggleMobile}
            className="p-2 rounded-lg hover:bg-gray-100/50 dark:hover:bg-gray-800/50 transition-colors"
          >
            <Menu className="w-6 h-6 text-gray-600 dark:text-gray-400" />
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

