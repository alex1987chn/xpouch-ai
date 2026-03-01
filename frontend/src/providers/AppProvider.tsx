import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react'
import { registerLoginDialogCallback } from '@/utils/authUtils'

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
  // Sidebar 状态 - 从 localStorage 读取初始值
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    const saved = localStorage.getItem('xpouch:sidebar-collapsed')
    return saved === 'true'
  })
  const [isSidebarMobileOpen, setIsSidebarMobileOpen] = useState(false)

  // Dialogs 状态
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [personalSettingsOpen, setPersonalSettingsOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deletingAgentId, setDeletingAgentId] = useState<string | null>(null)
  const [deletingAgentName, setDeletingAgentName] = useState('')
  const [loginOpen, setLoginOpen] = useState(false)

  // Sidebar 方法
  const toggleSidebarCollapsed = useCallback(() => {
    setIsSidebarCollapsed(prev => {
      const newValue = !prev
      localStorage.setItem('xpouch:sidebar-collapsed', String(newValue))
      return newValue
    })
  }, [])

  const toggleSidebarMobile = useCallback(() => {
    setIsSidebarMobileOpen(prev => !prev)
  }, [])

  const closeSidebarMobile = useCallback(() => {
    setIsSidebarMobileOpen(false)
  }, [])

  // Dialogs 方法
  const openSettings = useCallback(() => {
    setSettingsOpen(true)
  }, [])

  const closeSettings = useCallback(() => {
    setSettingsOpen(false)
  }, [])

  const openPersonalSettings = useCallback(() => {
    setPersonalSettingsOpen(true)
  }, [])

  const closePersonalSettings = useCallback(() => {
    setPersonalSettingsOpen(false)
  }, [])

  const openDeleteConfirm = useCallback((id: string, name: string) => {
    setDeletingAgentId(id)
    setDeletingAgentName(name)
    setDeleteConfirmOpen(true)
  }, [])

  const closeDeleteConfirm = useCallback(() => {
    setDeleteConfirmOpen(false)
    setDeletingAgentId(null)
    setDeletingAgentName('')
  }, [])

  // Login Dialog 方法
  const openLogin = useCallback(() => {
    setLoginOpen(true)
  }, [])

  const closeLogin = useCallback(() => {
    setLoginOpen(false)
  }, [])

  // 注册登录弹窗回调（供非 React 代码使用，如 API 错误处理）
  useEffect(() => {
    registerLoginDialogCallback(openLogin)
  }, [openLogin])

  // 监听全局登录弹窗事件（降级方案）
  useEffect(() => {
    const handleShowLogin = () => {
      setLoginOpen(true)
    }
    window.addEventListener('show-login-dialog', handleShowLogin)
    return () => window.removeEventListener('show-login-dialog', handleShowLogin)
  }, [])

  const contextValue: AppContextType = {
    sidebar: {
      isCollapsed: isSidebarCollapsed,
      isMobileOpen: isSidebarMobileOpen,
      toggleCollapsed: toggleSidebarCollapsed,
      toggleMobile: toggleSidebarMobile,
      closeMobile: closeSidebarMobile
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
      closeLogin
    },
    onCreateAgent: undefined // 由各页面设置
  }

  // React 19: Context 可以直接作为 Provider 使用
  return (
    <AppContext value={contextValue}>
      {children}
    </AppContext>
  )
}

export function useApp() {
  const context = useContext(AppContext)
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider')
  }
  return context
}

// React 19: 支持 use() hook 的导出
export { AppContext }
