/**
 * App UI 状态：直接读 useAppUIStore，无 Context。
 * 单一块用 useAppUIStore(s => s.xxx)，需要 sidebar/dialogs 形状时用本 hook。
 */
import { useAppUIStore } from '@/store/appUIStore'

export function useAppUISelectors() {
  const isSidebarCollapsed = useAppUIStore((s) => s.isSidebarCollapsed)
  const isSidebarMobileOpen = useAppUIStore((s) => s.isSidebarMobileOpen)
  const toggleSidebarCollapsed = useAppUIStore((s) => s.toggleSidebarCollapsed)
  const toggleSidebarMobile = useAppUIStore((s) => s.toggleSidebarMobile)
  const closeSidebarMobile = useAppUIStore((s) => s.closeSidebarMobile)

  const settingsOpen = useAppUIStore((s) => s.settingsOpen)
  const personalSettingsOpen = useAppUIStore((s) => s.personalSettingsOpen)
  const deleteConfirmOpen = useAppUIStore((s) => s.deleteConfirmOpen)
  const deletingAgentId = useAppUIStore((s) => s.deletingAgentId)
  const deletingAgentName = useAppUIStore((s) => s.deletingAgentName)
  const loginOpen = useAppUIStore((s) => s.loginOpen)

  const openSettings = useAppUIStore((s) => s.openSettings)
  const closeSettings = useAppUIStore((s) => s.closeSettings)
  const openPersonalSettings = useAppUIStore((s) => s.openPersonalSettings)
  const closePersonalSettings = useAppUIStore((s) => s.closePersonalSettings)
  const openDeleteConfirm = useAppUIStore((s) => s.openDeleteConfirm)
  const closeDeleteConfirm = useAppUIStore((s) => s.closeDeleteConfirm)
  const openLogin = useAppUIStore((s) => s.openLogin)
  const closeLogin = useAppUIStore((s) => s.closeLogin)

  return {
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
    onCreateAgent: undefined as (() => void) | undefined,
  }
}
