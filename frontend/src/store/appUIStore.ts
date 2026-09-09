import { create } from 'zustand'

/** 设置中心的分区；三个历史入口（设置/个人设置/账号与安全）映射为初始分区 */
export type SettingsSection = 'profile' | 'model' | 'security'

type AppUIState = {
  isSidebarCollapsed: boolean
  isSidebarMobileOpen: boolean
  settingsHubOpen: boolean
  settingsHubSection: SettingsSection
  deleteConfirmOpen: boolean
  deletingAgentId: string | null
  deletingAgentName: string
  loginOpen: boolean
}

type AppUIActions = {
  toggleSidebarCollapsed: () => void
  toggleSidebarMobile: () => void
  closeSidebarMobile: () => void
  openSettings: (section?: SettingsSection) => void
  closeSettings: () => void
  setSettingsSection: (section: SettingsSection) => void
  /** 历史入口：打开并定位到个人资料分区 */
  openPersonalSettings: () => void
  /** 历史入口：打开并定位到账号与安全分区 */
  openSecuritySettings: () => void
  openDeleteConfirm: (id: string, name: string) => void
  closeDeleteConfirm: () => void
  openLogin: () => void
  closeLogin: () => void
}

type AppUIStore = AppUIState & AppUIActions

function getInitialSidebarCollapsed(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem('xpouch:sidebar-collapsed') === 'true'
}

export const useAppUIStore = create<AppUIStore>((set) => ({
  isSidebarCollapsed: getInitialSidebarCollapsed(),
  isSidebarMobileOpen: false,
  settingsHubOpen: false,
  settingsHubSection: 'profile',
  deleteConfirmOpen: false,
  deletingAgentId: null,
  deletingAgentName: '',
  loginOpen: false,

  toggleSidebarCollapsed: () =>
    set((state) => {
      const next = !state.isSidebarCollapsed
      if (typeof window !== 'undefined') {
        localStorage.setItem('xpouch:sidebar-collapsed', String(next))
      }
      return { isSidebarCollapsed: next }
    }),
  toggleSidebarMobile: () => set((state) => ({ isSidebarMobileOpen: !state.isSidebarMobileOpen })),
  closeSidebarMobile: () => set({ isSidebarMobileOpen: false }),
  openSettings: (section) =>
    set({
      settingsHubOpen: true,
      // 兜底：误传事件对象等非分区值时回落到默认分区
      settingsHubSection: section === 'profile' || section === 'model' || section === 'security' ? section : 'profile',
    }),
  closeSettings: () => set({ settingsHubOpen: false }),
  setSettingsSection: (section) => set({ settingsHubSection: section }),
  openPersonalSettings: () => set({ settingsHubOpen: true, settingsHubSection: 'profile' }),
  openSecuritySettings: () => set({ settingsHubOpen: true, settingsHubSection: 'security' }),
  openDeleteConfirm: (id: string, name: string) =>
    set({
      deletingAgentId: id,
      deletingAgentName: name,
      deleteConfirmOpen: true,
    }),
  closeDeleteConfirm: () =>
    set({
      deleteConfirmOpen: false,
      deletingAgentId: null,
      deletingAgentName: '',
    }),
  openLogin: () => set({ loginOpen: true }),
  closeLogin: () => set({ loginOpen: false }),
}))
