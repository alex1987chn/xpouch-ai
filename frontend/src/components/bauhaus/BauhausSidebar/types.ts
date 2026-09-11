/**
 * =============================
 * BauhausSidebar 类型定义
 * =============================
 */

import { type Conversation } from '@/services/chat'
import { TranslationKey } from '@/i18n'
import { type Toast } from '@/components/ui/use-toast'

export type ToastFn = (props: Omit<Toast, 'id'>) => void

export interface BauhausSidebarProps {
  className?: string
  isCollapsed?: boolean
  onCreateAgent?: () => void
  onSettingsClick?: () => void
  onToggleCollapsed?: () => void
  isMobileOpen?: boolean
  onMobileClose?: () => void
}

export interface SidebarHeaderProps {
  isCollapsed: boolean
  onLogoClick: () => void
}

export interface NewChatButtonProps {
  isCollapsed: boolean
  isCreatingNewChat: boolean
  onNewChat: () => void
  t: (key: TranslationKey) => string
}

export interface NavigationMenuProps {
  isCollapsed: boolean
  isOnHome: boolean
  isOnLibrary: boolean
  isOnArtifacts: boolean
  isOnHistory: boolean
  isOnAdmin: boolean
  isOnStats: boolean
  isAdmin: boolean
  onMenuClick: (path: string) => void
  t: (key: TranslationKey) => string
  toast?: ToastFn
}

export interface RecentConversationsProps {
  conversations: Conversation[]
  onConversationClick: (threadId: string, agentId?: string) => void
  formatRelativeTime: (dateString: string | undefined) => string
  t: (key: TranslationKey) => string
}

export interface UserSectionProps {
  isCollapsed: boolean
  isAuthenticated: boolean
  user: {
    id?: string
    username?: string
    avatar?: string
    plan?: string
    role?: string
  } | null
  currentPlan: 'Free' | 'Pilot' | 'Maestro'
  planLabel: string
  onAvatarClick: () => void
  onLoginClick: () => void
  onToggleCollapsed?: () => void
  t: (key: TranslationKey) => string
}

export interface SettingsMenuProps {
  isOpen: boolean
  isAuthenticated: boolean
  user: {
    id?: string
    username?: string
    avatar?: string
    plan?: string
    role?: string
  } | null
  currentPlan: 'Free' | 'Pilot' | 'Maestro'
  language: 'zh' | 'en' | 'ja'
  onSettingsClick?: () => void
  onMobileClose?: () => void
  onLogout: () => void
  onLanguageChange: (lang: 'zh' | 'en' | 'ja') => void
  onClose: () => void
  t: (key: TranslationKey) => string
}
