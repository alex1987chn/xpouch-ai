/**
 * =============================
 * Bauhaus 风格侧边栏 (BauhausSidebar)
 * =============================
 *
 * [架构层级] Layer 2.5 - 导航组件
 *
 * [设计风格] Bauhaus (包豪斯设计风格)
 * - 几何形状：圆形按钮、方形卡片
 * - 高对比度：黑色边框、纯色填充
 * - 硬边风格：无圆角、锐利阴影
 * - 机械感：悬停偏移、点击反馈
 *
 * [核心功能]
 * 1. Logo 区域：The4DPocketLogo + 版本号
 * 2. 创建智能体：New Agent 按钮（大号按钮）
 * 3. 主导航：Dashboard/Knowledge/History/Experts
 * 4. 最近会话：Memory_Dump（最多 8 条）
 * 5. 用户区域：头像 + 设置菜单（Portal 弹出）
 *
 * [响应式设计]
 * - 桌面端：固定宽度 280px（展开）/ 72px（折叠）
 * - 移动端：全屏抽屉，带遮罩层
 *
 * [交互细节]
 * - 展开/折叠：ChevronRight 按钮
 * - 设置菜单：头像点击弹出，支持 Portal 渲染
 * - 语言切换：下拉菜单，支持 zh/en/ja
 * - 专家管理：仅 admin 角色显示
 */

import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useUserStore } from '@/store/userStore'
import { useChatStore } from '@/store/chatStore'
import { useTaskStore } from '@/store/taskStore'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { zhCN, enUS, ja } from 'date-fns/locale'
import { useTranslation } from '@/i18n'
import { useToast } from '@/components/ui/use-toast'
import { SYSTEM_AGENTS } from '@/constants/agents'
import { useRecentConversationsQuery } from '@/hooks/queries'
import type { BauhausSidebarProps } from './types'
import { SidebarHeader } from './SidebarHeader'
import { NewChatButton } from './NewChatButton'
import { NavigationMenu } from './NavigationMenu'
import { RecentConversations } from './RecentConversations'
import { UserSection } from './UserSection'
import { SettingsMenu } from './SettingsMenu'

export type { BauhausSidebarProps }

export default function BauhausSidebar({
  className,
  isCollapsed = false,
  onSettingsClick,
  onPersonalSettingsClick,
  onToggleCollapsed,
  onMobileClose,
}: BauhausSidebarProps) {
  const { t, language, setLanguage } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { toast } = useToast()
  const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState(false)
  const { user, isAuthenticated, logout } = useUserStore()
  const setLoginDialogOpen = useTaskStore(state => state.setLoginDialogOpen)
  const inputMessage = useChatStore(state => state.inputMessage)
  const setInputMessage = useChatStore(state => state.setInputMessage)
  const setMessages = useChatStore(state => state.setMessages)
  const setCurrentConversationId = useChatStore(state => state.setCurrentConversationId)

  // 使用 React Query 获取最近会话
  const { data: recentConversations = [] } = useRecentConversationsQuery(20, { enabled: isAuthenticated })

  // 判断当前页面
  const isOnHome = location.pathname === '/'
  const isOnLibrary = location.pathname === '/library'
  const isOnHistory = location.pathname === '/history'
  const isOnAdmin = location.pathname === '/admin/experts'

  // 判断是否显示专家配置入口
  const isAdmin = user?.role === 'admin'
  const showExpertAdmin = true

  // 用户数据
  const username = user?.username || 'User'
  const avatar = user?.avatar
  const currentPlan = (user?.plan as 'Free' | 'Pilot' | 'Maestro') || 'Free'

  // 套餐权益文案
  const planLabel = {
    'Free': 'Free',
    'Pilot': 'Pilot',
    'Maestro': 'Maestro'
  }[currentPlan]

  // 格式化相对时间
  const formatRelativeTime = (dateString: string | undefined): string => {
    if (!dateString) return '-'
    try {
      const date = parseISO(dateString)
      const now = new Date()
      const diffMs = now.getTime() - date.getTime()
      const diffSec = Math.floor(diffMs / 1000)

      // 小于1秒显示"刚刚"
      if (diffSec < 1) return t('justNow')
      // 小于60秒显示具体秒数
      if (diffSec < 60) return t('secondsAgo', { count: diffSec })

      // 使用 date-fns 的 formatDistanceToNow
      const localeMap = { zh: zhCN, en: enUS, ja }
      return formatDistanceToNow(date, {
        addSuffix: true,
        locale: localeMap[language] || enUS
      })
    } catch (e) {
      return '-'
    }
  }

  // 需要登录才能访问的路由
  const authRequiredPaths = ['/library', '/history']

  // 处理导航点击
  const handleMenuClick = (path: string) => {
    // 检查是否需要登录
    if (authRequiredPaths.includes(path) && !isAuthenticated) {
      setLoginDialogOpen(true)
      return
    }
    navigate(path)
    onMobileClose?.()
  }

  // 处理会话点击
  const handleConversationClick = (conversationId: string, agentId?: string) => {
    // 先清空当前状态，避免显示旧会话内容
    setMessages([])
    setCurrentConversationId(null)
    // 重置 taskStore 所有状态
    useTaskStore.getState().resetAll(true)
    
    // 默认助手不添加 agentId 参数
    if (agentId && agentId !== SYSTEM_AGENTS.DEFAULT_CHAT && agentId !== 'default-chat') {
      navigate(`/chat/${conversationId}?agentId=${agentId}`)
    } else {
      navigate(`/chat/${conversationId}`)
    }
    onMobileClose?.()
  }

  // 设置菜单外部点击处理
  useEffect(() => {
    if (!isSettingsMenuOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      const menu = document.querySelector('[data-settings-menu]')
      const avatarButton = document.querySelector('[data-avatar-button]')
      
      // 如果点击的是头像按钮，让头像按钮的点击事件处理
      if (avatarButton && avatarButton.contains(event.target as Node)) {
        return
      }
      
      // 如果点击的是菜单内部，不关闭
      if (menu && menu.contains(event.target as Node)) {
        return
      }
      
      // 点击外部，关闭菜单
      setIsSettingsMenuOpen(false)
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isSettingsMenuOpen])

  const handleLogout = () => {
    logout()
    setIsSettingsMenuOpen(false)
  }

  // 防止重复点击新建会话的 loading 状态
  const [isCreatingNewChat, setIsCreatingNewChat] = useState(false)

  // 处理新建会话
  const handleNewChat = () => {
    // 防抖：防止快速重复点击
    if (isCreatingNewChat) return
    
    // 未登录时弹出登录弹窗
    if (!isAuthenticated) {
      setLoginDialogOpen(true)
      return
    }
    
    setIsCreatingNewChat(true)

    // 检查当前是否在聊天页面且有未发送的消息
    const isOnChatPage = location.pathname.startsWith('/chat')
    const hasUnsentMessage = inputMessage?.trim().length > 0

    if (isOnChatPage && hasUnsentMessage) {
      // 保存草稿到 localStorage
      localStorage.setItem('xpouch_chat_draft', inputMessage)
      toast({
        title: t('newChat'),
        description: t('draftSaved'),
        variant: 'default'
      })
    }

    // Server-Driven UI: 清空所有 Store 状态
    setInputMessage('')
    setMessages([])
    setCurrentConversationId(null)
    useChatStore.getState().setSelectedAgentId(SYSTEM_AGENTS.DEFAULT_CHAT)
    useTaskStore.getState().resetAll()

    // 创建新会话 ID 并导航
    const newId = crypto.randomUUID()
    navigate(`/chat/${newId}`, { state: { isNew: true } })
    onMobileClose?.()

    // 500ms 后解除防抖状态
    setTimeout(() => setIsCreatingNewChat(false), 500)
  }

  return (
    <div
      className={cn(
        "w-full h-full flex flex-col text-[var(--text-primary)]",
        className
      )}
    >
      {/* Logo 区域 */}
      <SidebarHeader isCollapsed={isCollapsed} onLogoClick={() => handleMenuClick('/')} />

      {/* 菜单区域 */}
      <div className="flex-1 flex flex-col items-center overflow-hidden min-h-0">
        {/* 新建会话按钮 */}
        <NewChatButton
          isCollapsed={isCollapsed}
          isCreatingNewChat={isCreatingNewChat}
          onNewChat={handleNewChat}
          t={t}
        />

        {/* 导航菜单 - 根据收拢状态使用不同容器 */}
        {isCollapsed ? (
          <NavigationMenu
            isCollapsed={true}
            isOnHome={isOnHome}
            isOnLibrary={isOnLibrary}
            isOnHistory={isOnHistory}
            isOnAdmin={isOnAdmin}
            isAdmin={isAdmin}
            showExpertAdmin={showExpertAdmin}
            onMenuClick={handleMenuClick}
            t={t}
            toast={toast}
          />
        ) : (
          <>
            <NavigationMenu
              isCollapsed={false}
              isOnHome={isOnHome}
              isOnLibrary={isOnLibrary}
              isOnHistory={isOnHistory}
              isOnAdmin={isOnAdmin}
              isAdmin={isAdmin}
              showExpertAdmin={showExpertAdmin}
              onMenuClick={handleMenuClick}
              t={t}
              toast={toast}
            />
            {/* 最近会话列表 - 仅在展开时显示 */}
            <RecentConversations
              conversations={recentConversations}
              onConversationClick={handleConversationClick}
              formatRelativeTime={formatRelativeTime}
              t={t}
            />
          </>
        )}
      </div>

      {/* 底部用户区域 */}
      <UserSection
        isCollapsed={isCollapsed}
        isAuthenticated={isAuthenticated}
        user={user}
        currentPlan={currentPlan}
        planLabel={planLabel}
        onAvatarClick={() => setIsSettingsMenuOpen(!isSettingsMenuOpen)}
        onToggleCollapsed={onToggleCollapsed}
        onLoginClick={() => setLoginDialogOpen(true)}
        t={t}
      />

      {/* 设置弹出菜单 - Portal */}
      <SettingsMenu
        isOpen={isSettingsMenuOpen}
        isAuthenticated={isAuthenticated}
        user={user}
        currentPlan={currentPlan}
        language={language}
        onPersonalSettingsClick={onPersonalSettingsClick}
        onSettingsClick={onSettingsClick}
        onMobileClose={onMobileClose}
        onLogout={handleLogout}
        onLanguageChange={setLanguage}
        onClose={() => setIsSettingsMenuOpen(false)}
        t={t}
      />
    </div>
  )
}
