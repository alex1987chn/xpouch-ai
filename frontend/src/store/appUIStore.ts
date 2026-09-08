import { create } from 'zustand'

type AppUIState = {
  isSidebarCollapsed: boolean
  isSidebarMobileOpen: boolean
  settingsOpen: boolean
  personalSettingsOpen: boolean
  securitySettingsOpen: boolean
  deleteConfirmOpen: boolean
  deletingAgentId: string | null
  deletingAgentName: string
  loginOpen: boolean
}

type AppUIActions = {
  toggleSidebarCollapsed: () => void
  toggleSidebarMobile: () => void
  closeSidebarMobile: () => void
  openSettings: () => void
  closeSettings: () => void
  openPersonalSettings: () => void
  closePersonalSettings: () => void
  openSecuritySettings: () => void
  closeSecuritySettings: () => void
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
  settingsOpen: false,
  personalSettingsOpen: false,
  securitySettingsOpen: false,
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
  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
  openPersonalSettings: () => set({ personalSettingsOpen: true }),
  closePersonalSettings: () => set({ personalSettingsOpen: false }),
  openSecuritySettings: () => set({ securitySettingsOpen: true }),
  closeSecuritySettings: () => set({ securitySettingsOpen: false }),
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
