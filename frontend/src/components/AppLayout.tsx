import { ReactNode, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Menu, Sun, Moon } from 'lucide-react'
import { useTranslation } from '@/i18n'
import { BauhausSidebar } from '@/components/bauhaus'
import { MobileOverlay } from '@/components/common'
import { SettingsDialog } from '@/components/settings/SettingsDialog'
import { PersonalSettingsDialog } from '@/components/settings/PersonalSettingsDialog'
import { DeleteConfirmDialog } from '@/components/settings/DeleteConfirmDialog'
import LoginDialog from '@/components/auth/LoginDialog'
import { useApp } from '@/providers/AppProvider'
import { useTheme } from '@/hooks/useTheme'
import { useTaskStore } from '@/store/taskStore'
import { useChatStore } from '@/store/chatStore'
import { useQueryClient } from '@tanstack/react-query'
import { logger } from '@/utils/logger'
import { useToast } from '@/components/ui/use-toast'
import { Z_INDEX } from '@/constants/zIndex'

/**
 * =============================
 * 全局应用布局组件 (AppLayout)
 * =============================
 *
 * [架构层级] Layer 2 - 应用根布局
 *
 * [功能描述]
 * 提供全局应用的固定布局结构，包括：
 * - 左侧 Bauhaus 风格侧边栏（导航+用户）
 * - 右侧主内容区域（页面内容）
 * - 全局 Dialogs（设置、删除确认）
 * - 主题切换按钮
 * - 移动端响应式适配
 *
 * [响应式设计]
 * - 桌面端 (lg): 固定侧边栏（折叠 72px / 展开 280px）
 * - 移动端: 抽屉式侧边栏，带遮罩层
 *
 * [样式风格]
 * Bauhaus 工业风格：硬边、黑色边框、锐利阴影
 * - 阴影：shadow-[var(--shadow-color)_4px_4px_0_0]
 * - 边框：border-2 border-[var(--border-color)]
 * - 强调色：var(--accent-hover) #facc15
 *
 * [使用示例]
 * ```tsx
 * <AppLayout>
 *   <HomePage />
 * </AppLayout>
 *
 * <AppLayout hideMobileMenu>
 *   <UnifiedChatPage />
 * </AppLayout>
 * ```
 */
interface AppLayoutProps {
  /** 子组件内容（页面组件） */
  children: ReactNode
  /** 是否隐藏移动端汉堡菜单（如聊天页不需要） */
  hideMobileMenu?: boolean
}

export default function AppLayout({ children, hideMobileMenu = false }: AppLayoutProps) {
  const navigate = useNavigate()
  const { sidebar, dialogs } = useApp()
  const { theme, toggleTheme } = useTheme()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  
  // 全局登录弹窗状态
  const isLoginDialogOpen = useTaskStore(state => state.isLoginDialogOpen)
  const setLoginDialogOpen = useTaskStore(state => state.setLoginDialogOpen)
  
  // 登录成功回调：刷新所有查询缓存，并触发消息重发
  const handleLoginSuccess = () => {
    logger.info('[AppLayout] 登录成功，刷新数据')
    queryClient.invalidateQueries()
    
    // 检查是否有待发送的消息
    const { pendingMessage, setShouldRetrySend } = useChatStore.getState()
    if (pendingMessage) {
      logger.info('[AppLayout] 检测到待发送消息，准备导航到聊天页')
      toast({
        title: '登录成功',
        description: '正在发送刚才的消息...',
      })
      // 导航到聊天页，携带 pendingMessage
      const newId = crypto.randomUUID()
      navigate(`/chat/${newId}`, { state: { startWith: pendingMessage } })
      // 设置重试标志（ UnifiedChatPage 会处理发送）
      setShouldRetrySend(true)
    }
  }

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
    dialogs.closeDeleteConfirm()
  }

  return (
    <div
      className={cn(
        'flex w-full bg-[var(--bg-page)] transition-colors duration-200 overflow-hidden',
        'h-[100dvh]'
      )}
    >
      {/* 网格背景 */}
      <div className="fixed inset-0 pointer-events-none bg-[var(--bg-page)] opacity-50" style={{
        backgroundImage: 'radial-gradient(var(--text-secondary) 1.5px, transparent 1.5px)',
        backgroundSize: '32px 32px',
        zIndex: Z_INDEX.BACKGROUND
      }} aria-hidden="true" />

      {/* 移动端侧边栏遮罩 */}
      <MobileOverlay
        show={sidebar.isMobileOpen}
        onClick={sidebar.closeMobile}
      />

      {/* Bauhaus 侧边栏 - 还原原型 flex 布局 */}
      <aside className={cn(
        'h-full flex-shrink-0 transition-all duration-300 border-r-2 border-[var(--border-color)] bg-[var(--bg-card)] overflow-hidden',
        sidebar.isCollapsed ? 'w-[72px]' : 'w-[280px]',
        'hidden lg:flex lg:flex-col'
      )} style={{ zIndex: Z_INDEX.SIDEBAR }}>
        <BauhausSidebar
          isCollapsed={sidebar.isCollapsed}
          isMobileOpen={sidebar.isMobileOpen}
          onMobileClose={sidebar.closeMobile}
          onCreateAgent={handleCreateAgent}
          onSettingsClick={dialogs.openSettings}
          onPersonalSettingsClick={dialogs.openPersonalSettings}
          onToggleCollapsed={sidebar.toggleCollapsed}
        />
      </aside>

      {/* 移动端侧边栏 */}
      {sidebar.isMobileOpen && (
        <aside className="fixed left-0 top-0 h-[100dvh] w-[280px] border-r-2 border-[var(--border-color)] bg-[var(--bg-card)] lg:hidden" style={{ zIndex: Z_INDEX.MOBILE_SIDEBAR }}>
          <div className="h-full w-full">
            <BauhausSidebar
              isCollapsed={false}
              isMobileOpen={sidebar.isMobileOpen}
              onMobileClose={sidebar.closeMobile}
              onCreateAgent={handleCreateAgent}
              onSettingsClick={dialogs.openSettings}
              onPersonalSettingsClick={dialogs.openPersonalSettings}
              onToggleCollapsed={sidebar.toggleCollapsed}
            />
          </div>
        </aside>
      )}

      {/* 主内容区域 - 右侧交互区 */}
      <main className="flex-1 w-full h-full relative overflow-y-auto min-w-0" style={{ zIndex: Z_INDEX.CONTENT }}>
        {/* 移动端汉堡菜单按钮 - Bauhaus 风格 */}
        {!hideMobileMenu && (
          <div className="lg:hidden absolute top-4 left-4" style={{ zIndex: Z_INDEX.HEADER }}>
            <button
              onClick={sidebar.toggleMobile}
              className="p-2 border-2 border-[var(--border-color)] bg-[var(--bg-card)] shadow-[var(--shadow-color)_4px_4px_0_0] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[var(--accent-hover)_2px_2px_0_0]"
            >
              <Menu className="w-5 h-5 stroke-[2.5]" />
            </button>
          </div>
        )}

        {/* 主要内容 */}
        {children}
      </main>

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
        title={t('deleteAgentConfirm')}
        description={t('deleteAgentConfirmDesc')}
        itemName={dialogs.deletingAgentName}
      />

      {/* 全局登录弹窗 - 401 时自动触发 */}
      <LoginDialog
        open={isLoginDialogOpen}
        onOpenChange={setLoginDialogOpen}
        onSuccess={handleLoginSuccess}
      />

      {/* 主题切换按钮 - Bauhaus风格圆形按钮 */}
      <div className="fixed bottom-8 right-8" style={{ zIndex: Z_INDEX.DROPDOWN }}>
        <button
          onClick={toggleTheme}
          className="w-12 h-12 flex items-center justify-center border-2 border-[var(--border-color)] bg-[var(--bg-card)] shadow-[var(--shadow-color)_4px_4px_0_0] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[var(--accent-hover)_2px_2px_0_0] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all overflow-hidden theme-toggle-btn"
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


