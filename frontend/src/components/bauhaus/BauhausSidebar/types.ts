/**
 * =============================
 * BauhausSidebar 类型定义
 * =============================
 */

import { type Conversation } from '@/services/chat'
import { TranslationKey } from '@/i18n'

export interface BauhausSidebarProps {
  className?: string
  isCollapsed?: boolean
  onCreateAgent?: () => void
  onSettingsClick?: () => void
  onPersonalSettingsClick?: () => void
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
  isOnHistory: boolean
  isOnAdmin: boolean
  isAdmin: boolean
  showExpertAdmin: boolean
  onMenuClick: (path: string) => void
  t: (key: TranslationKey) => string
  toast: (options: { title: string; description: string; variant: 'default' | 'destructive' }) => void
}

export interface RecentConversationsProps {
  conversations: Conversation[]
  onConversationClick: (conversationId: string, agentId?: string) => void
  formatRelativeTime: (dateString: string | undefined) => string
  t: (key: TranslationKey) => string
}

export interface UserSectionProps {
  isCollapsed: boolean
  isAuthenticated: boolean
  user: {
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
    username?: string
    avatar?: string
    plan?: string
  } | null
  currentPlan: 'Free' | 'Pilot' | 'Maestro'
  language: 'zh' | 'en' | 'ja'
  onPersonalSettingsClick?: () => void
  onSettingsClick?: () => void
  onMobileClose?: () => void
  onLogout: () => void
  onLanguageChange: (lang: 'zh' | 'en' | 'ja') => void
  onClose: () => void
  t: (key: TranslationKey) => string
}
