import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

interface AppContextType {
  // Sidebar 状态
  sidebar: {
    isCollapsed: boolean
    isMobileOpen: boolean
    toggleCollapsed: () => void
    toggleMobile: () => void
    closeMobile: () => void
  }
  // Dialogs 状态
  dialogs: {
    settingsOpen: boolean
    personalSettingsOpen: boolean
    deleteConfirmOpen: boolean
    deletingAgentId: string | null
    deletingAgentName: string
    openSettings: () => void
    closeSettings: () => void
    openPersonalSettings: () => void
    closePersonalSettings: () => void
    openDeleteConfirm: (id: string, name: string) => void
    closeDeleteConfirm: () => void
  }
  // 创建 Agent 回调
  onCreateAgent?: () => void
}

const AppContext = createContext<AppContextType | undefined>(undefined)

export function AppProvider({ children }: { children: ReactNode }) {
  // Sidebar 状态
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [isSidebarMobileOpen, setIsSidebarMobileOpen] = useState(false)

  // Dialogs 状态
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [personalSettingsOpen, setPersonalSettingsOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deletingAgentId, setDeletingAgentId] = useState<string | null>(null)
  const [deletingAgentName, setDeletingAgentName] = useState('')

  // Sidebar 方法
  const toggleSidebarCollapsed = useCallback(() => {
    setIsSidebarCollapsed(prev => !prev)
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
      openSettings,
      closeSettings,
      openPersonalSettings,
      closePersonalSettings,
      openDeleteConfirm,
      closeDeleteConfirm
    },
    onCreateAgent: undefined // 由各页面设置
  }

  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const context = useContext(AppContext)
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider')
  }
  return context
}
