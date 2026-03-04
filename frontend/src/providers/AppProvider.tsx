import { createContext, useContext, useEffect, useMemo, ReactNode } from 'react'
import { registerLoginDialogCallback } from '@/utils/authUtils'
import { useAppUIStore } from '@/store/appUIStore'

/**
 * =============================
 * 全局应用状态管理 (AppProvider)
 * =============================
 *
 * [架构层级] Layer 1 - 根状态提供者
 *
 * [功能描述]
 * 统一管理全局应用状态，包括：
 * - Sidebar 状态：折叠/展开、移动端开关
 * - Dialogs 状态：设置弹窗、个人设置、删除确认
 * - onCreateAgent 回调：由各页面设置
 *
 * [设计原则]
 * - 单一数据源：所有全局状态集中管理
 * - Context API：避免 prop drilling
 * - 事件驱动：通过回调方法触发状态变更
 *
 * [使用示例]
 * ```tsx
 * // 在组件中使用
 * const { sidebar, dialogs } = useApp()
 *
 * // 切换侧边栏折叠
 * sidebar.toggleCollapsed()
 *
 * // 打开设置弹窗
 * dialogs.openSettings()
 *
 * // 打开删除确认
 * dialogs.openDeleteConfirm(agentId, agentName)
 * ```
 * 
 * [React 19 更新]
 * - Context 可直接作为 Provider 使用
 * - 支持 use() hook 读取 Context
 */
interface AppContextType {
  /** 侧边栏状态和方法 */
  sidebar: {
    isCollapsed: boolean // 桌面端是否折叠
    isMobileOpen: boolean // 移动端是否打开
    toggleCollapsed: () => void // 切换折叠状态
    toggleMobile: () => void // 切换移动端开关
    closeMobile: () => void // 关闭移动端侧边栏
  }
  /** 全局弹窗状态和方法 */
  dialogs: {
    settingsOpen: boolean // 系统设置弹窗
    personalSettingsOpen: boolean // 个人设置弹窗
    deleteConfirmOpen: boolean // 删除确认弹窗
    deletingAgentId: string | null // 正在删除的智能体ID
    deletingAgentName: string // 正在删除的智能体名称
    loginOpen: boolean // 登录弹窗
    openSettings: () => void // 打开系统设置
    closeSettings: () => void // 关闭系统设置
    openPersonalSettings: () => void // 打开个人设置
    closePersonalSettings: () => void // 关闭个人设置
    openDeleteConfirm: (id: string, name: string) => void // 打开删除确认
    closeDeleteConfirm: () => void // 关闭删除确认
    openLogin: () => void // 打开登录弹窗
    closeLogin: () => void // 关闭登录弹窗
  }
  /** 创建智能体回调（由各页面设置） */
  onCreateAgent?: () => void
}

const AppContext = createContext<AppContextType | undefined>(undefined)

export function AppProvider({ children }: { children: ReactNode }) {
  const isSidebarCollapsed = useAppUIStore((state) => state.isSidebarCollapsed)
  const isSidebarMobileOpen = useAppUIStore((state) => state.isSidebarMobileOpen)
  const settingsOpen = useAppUIStore((state) => state.settingsOpen)
  const personalSettingsOpen = useAppUIStore((state) => state.personalSettingsOpen)
  const deleteConfirmOpen = useAppUIStore((state) => state.deleteConfirmOpen)
  const deletingAgentId = useAppUIStore((state) => state.deletingAgentId)
  const deletingAgentName = useAppUIStore((state) => state.deletingAgentName)
  const loginOpen = useAppUIStore((state) => state.loginOpen)

  const toggleSidebarCollapsed = useAppUIStore((state) => state.toggleSidebarCollapsed)
  const toggleSidebarMobile = useAppUIStore((state) => state.toggleSidebarMobile)
  const closeSidebarMobile = useAppUIStore((state) => state.closeSidebarMobile)
  const openSettings = useAppUIStore((state) => state.openSettings)
  const closeSettings = useAppUIStore((state) => state.closeSettings)
  const openPersonalSettings = useAppUIStore((state) => state.openPersonalSettings)
  const closePersonalSettings = useAppUIStore((state) => state.closePersonalSettings)
  const openDeleteConfirm = useAppUIStore((state) => state.openDeleteConfirm)
  const closeDeleteConfirm = useAppUIStore((state) => state.closeDeleteConfirm)
  const openLogin = useAppUIStore((state) => state.openLogin)
  const closeLogin = useAppUIStore((state) => state.closeLogin)

  // 注册登录弹窗回调（供非 React 代码使用，如 API 错误处理）
  useEffect(() => {
    registerLoginDialogCallback(openLogin)
  }, [openLogin])

  // 监听全局登录弹窗事件（降级方案）
  useEffect(() => {
    const handleShowLogin = () => {
      openLogin()
    }
    window.addEventListener('show-login-dialog', handleShowLogin)
    return () => window.removeEventListener('show-login-dialog', handleShowLogin)
  }, [openLogin])

  const contextValue: AppContextType = useMemo(
    () => ({
      sidebar: {
        isCollapsed: isSidebarCollapsed,
        isMobileOpen: isSidebarMobileOpen,
        toggleCollapsed: toggleSidebarCollapsed,
        toggleMobile: toggleSidebarMobile,
        closeMobile: closeSidebarMobile,
      },
      dialogs: {
        settingsOpen,
        personalSettingsOpen,
        deleteConfirmOpen,
        deletingAgentId,
        deletingAgentName,
        loginOpen,
        openSettings,
        closeSettings,
        openPersonalSettings,
        closePersonalSettings,
        openDeleteConfirm,
        closeDeleteConfirm,
        openLogin,
        closeLogin,
      },
      onCreateAgent: undefined, // 由各页面设置
    }),
    [
      isSidebarCollapsed,
      isSidebarMobileOpen,
      toggleSidebarCollapsed,
      toggleSidebarMobile,
      closeSidebarMobile,
      settingsOpen,
      personalSettingsOpen,
      deleteConfirmOpen,
      deletingAgentId,
      deletingAgentName,
      loginOpen,
      openSettings,
      closeSettings,
      openPersonalSettings,
      closePersonalSettings,
      openDeleteConfirm,
      closeDeleteConfirm,
      openLogin,
      closeLogin,
    ]
  )

  // React 19: Context 可以直接作为 Provider 使用
  return (
    <AppContext value={contextValue}>
      {children}
    </AppContext>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useApp() {
  const context = useContext(AppContext)
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider')
  }
  return context
}

