import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useLocation } from 'react-router-dom'
import { Home, Database, MessageSquare, Shield, Plus, MessageSquarePlus, User, ChevronRight, Cog, Clock, ArrowRight, Star, Plane, Crown, Globe } from 'lucide-react'
import { cn } from '@/lib/utils'
import { The4DPocketLogo } from '@/components/bauhaus'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { type Conversation } from '@/services/chat'
import { useUserStore } from '@/store/userStore'
import { useChatStore } from '@/store/chatStore'
import { useTaskStore } from '@/store/taskStore'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { zhCN, enUS, ja } from 'date-fns/locale'
import { logger } from '@/utils/logger'
import { useTranslation } from '@/i18n'
import { getAvatarDisplay } from '@/utils/userSettings'
import LoginDialog from '@/components/auth/LoginDialog'
import { useToast } from '@/components/ui/use-toast'
import { VERSION } from '@/constants/ui'
import { SYSTEM_AGENTS } from '@/constants/agents'
import { useRecentConversationsQuery } from '@/hooks/queries'
import { useQueryClient } from '@tanstack/react-query'

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
 * 4. 最近会话：Memory_Dump（最多 5 条）
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

export default function BauhausSidebar({
  className,
  isCollapsed = false,
  onCreateAgent,
  onSettingsClick,
  onPersonalSettingsClick,
  onToggleCollapsed,
  isMobileOpen = false,
  onMobileClose,
}: BauhausSidebarProps) {
  const { t, language, setLanguage } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState(false)
  const [isLoginDialogOpen, setIsLoginDialogOpen] = useState(false)
  const { user, isAuthenticated, logout } = useUserStore()
  const inputMessage = useChatStore(state => state.inputMessage)
  const setInputMessage = useChatStore(state => state.setInputMessage)
  const setMessages = useChatStore(state => state.setMessages)
  const setCurrentConversationId = useChatStore(state => state.setCurrentConversationId)

  // 登录成功后刷新所有数据
  const handleLoginSuccess = () => {
    // 刷新所有 React Query 缓存
    queryClient.invalidateQueries()
    // 显示成功提示
    toast({
      title: '登录成功',
      description: '欢迎回来！',
    })
  }

  // 使用 React Query 获取最近会话（自动缓存，5分钟内不会重复请求）
  const { data: recentConversations = [] } = useRecentConversationsQuery(20)

  // 判断当前页面
  const isOnHome = location.pathname === '/'
  const isOnKnowledge = location.pathname === '/knowledge'
  const isOnHistory = location.pathname === '/history'
  const isOnAdmin = location.pathname === '/admin/experts'

  // 判断是否显示专家配置入口：需要登录且是 admin 角色，且非移动端
  const isAdmin = user?.role === 'admin'
  const showExpertAdmin = isAuthenticated && isAdmin && !isMobileOpen

  // 用户数据
  const username = user?.username || 'User'
  const avatar = user?.avatar
  // 优先使用 Store 中的 plan，如果没有则默认为 Free
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

  // 👈 已迁移到 React Query: useRecentConversationsQuery(20)
  // 自动缓存管理，5分钟内数据被视为新鲜，不会重复请求

  // 处理导航点击
  const handleMenuClick = (path: string) => {
    navigate(path)
    onMobileClose?.()
  }

  // 处理会话点击
  const handleConversationClick = (conversationId: string, agentId?: string) => {
    // 👈 关键：先清空当前状态，避免显示旧会话内容
    setMessages([])
    setCurrentConversationId(null)
    
    // 👈 默认助手不添加 agentId 参数，让后端自动使用 sys-default-chat
    if (agentId && agentId !== 'sys-default-chat' && agentId !== 'default-chat') {
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

  const getLocale = () => {
    const lang = language || 'en'
    switch (lang) {
      case 'zh': return zhCN
      case 'ja': return ja
      default: return enUS
    }
  }

  const handleLogout = () => {
    logout()
    setIsSettingsMenuOpen(false)
  }

  // 防止重复点击新建会话的 loading 状态
  const [isCreatingNewChat, setIsCreatingNewChat] = useState(false)

  // 处理新建会话 - 和首页输入框逻辑一致
  const handleNewChat = () => {
    // 防抖：防止快速重复点击
    if (isCreatingNewChat) return
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

    // 🔥🔥🔥 Server-Driven UI: 清空所有 Store 状态
    // 新会话使用默认助手，由后端 Router 决策模式
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
      {/* Logo 区域 - 完全按照旧侧边栏的布局 */}
      <div className="flex items-center relative">
        {isCollapsed ? (
          <div className="w-full py-3 justify-center flex items-center">
            <div
              onClick={() => handleMenuClick('/')}
              className="cursor-pointer scale-[0.7]"
            >
              <The4DPocketLogo />
            </div>
          </div>
        ) : (
          <div className="w-full pt-4 pb-8 px-2 flex justify-center">
            <div
              onClick={() => handleMenuClick('/')}
              className="cursor-pointer flex items-center gap-4 group select-none w-[230px] h-[60px]"
            >
              <div className="shrink-0 flex items-center">
                <The4DPocketLogo />
              </div>
              <div className="flex flex-col justify-center">
                {/* 工业风格 Logo: [ XPOUCH ] */}
                <h1 className="text-xl font-black tracking-tighter uppercase leading-none flex items-center">
                  <span className="text-gray-400">[</span>
                  <span className="text-yellow-400">X</span>
                  <span className="text-slate-900 dark:text-slate-100">POUCH</span>
                  <span className="text-gray-400">]</span>
                </h1>
                <div className="flex items-center gap-2 mt-0.5">
                  <div className="w-1.5 h-1.5 bg-[var(--accent-hover)] rounded-full animate-pulse"></div>
                  <span className="font-mono text-[10px] text-[var(--text-secondary)] tracking-widest group-hover:text-[var(--text-primary)] transition-colors">OS {VERSION.CURRENT}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 菜单区域 */}
      <div className="flex-1 flex flex-col items-center overflow-hidden min-h-0">
        {/* 新建会话按钮 - 直接跳转到聊天页面 */}
        <div className="pb-4 w-full flex justify-center" style={{ maxWidth: '230px' }}>
          {isCollapsed ? (
            <div className="flex justify-center">
              <button
                onClick={handleNewChat}
                disabled={isCreatingNewChat}
                className="w-9 h-9 rounded-full border-2 border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-primary)] shadow-[var(--shadow-color)_4px_4px_0_0] hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[var(--accent-hover)_6px_6px_0_0] hover:bg-[var(--accent-hover)] hover:text-black hover:border-black active:translate-x-[2px] active:translate-y-[2px] active:shadow-none relative group disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-[var(--shadow-color)_4px_4px_0_0]"
                title={t('newChat')}
              >
                <MessageSquarePlus className="w-4 h-4 relative z-10" />
              </button>
            </div>
          ) : (
            <button
              onClick={handleNewChat}
              disabled={isCreatingNewChat}
              className="w-[230px] h-[60px] rounded-lg flex items-center justify-center gap-2 border-2 border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-primary)] shadow-[var(--shadow-color)_4px_4px_0_0] hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[var(--accent-hover)_6px_6px_0_0] hover:bg-[var(--accent-hover)] hover:text-black hover:border-black active:translate-x-[2px] active:translate-y-[2px] active:shadow-none relative group px-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-[var(--shadow-color)_4px_4px_0_0]"
            >
              <div className="absolute top-0 right-0 w-4 h-4 bg-[var(--border-color)] transition-all group-hover:w-full group-hover:h-full group-hover:bg-[var(--accent-hover)] -z-10" />
              <MessageSquarePlus className="w-4 h-4 relative z-10" />
              <span className="relative z-10 group-hover:text-black">{t('newChat')}</span>
            </button>
          )}
        </div>

        {/* 菜单区域 - 根据收拢状态使用不同容器 */}
        {isCollapsed ? (
          <div className="flex-1 flex flex-col items-center">
            {/* 主菜单 - 首页、知识库、历史记录 */}
            <div className="flex flex-col items-center space-y-2">
              {/* 首页按钮 */}
              <button
                onClick={() => handleMenuClick('/')}
                className={cn(
                  'h-9 w-9 transition-all duration-200 justify-center p-0 rounded-full border-2',
                  isOnHome
                    ? 'bg-[var(--accent-hover)] text-black border-[var(--border-color)] shadow-[4px_4px_0_0_var(--shadow-color)]'
                    : 'border-[var(--border-color)] text-slate-400 hover:bg-[var(--bg-page)] hover:text-gray-700 dark:hover:text-slate-200'
                )}
              >
                <Home className="w-4 h-4 flex-shrink-0" />
              </button>

              {/* 知识库按钮 */}
              <button
                onClick={() => handleMenuClick('/knowledge')}
                className={cn(
                  'h-9 w-9 transition-all duration-200 justify-center p-0 rounded-full border-2',
                  isOnKnowledge
                    ? 'bg-[var(--accent-hover)] text-black border-[var(--border-color)] shadow-[4px_4px_0_0_var(--shadow-color)]'
                    : 'border-[var(--border-color)] text-slate-400 hover:bg-[var(--bg-page)] hover:text-gray-700 dark:hover:text-slate-200'
                )}
              >
                <Database className="w-4 h-4 flex-shrink-0" />
              </button>

              {/* 历史记录按钮 */}
              <button
                onClick={() => handleMenuClick('/history')}
                className={cn(
                  'h-9 w-9 transition-all duration-200 justify-center p-0 rounded-full border-2',
                  isOnHistory
                    ? 'bg-[var(--accent-hover)] text-black border-[var(--border-color)] shadow-[4px_4px_0_0_var(--shadow-color)]'
                    : 'border-[var(--border-color)] text-slate-400 hover:bg-[var(--bg-page)] hover:text-gray-700 dark:hover:text-slate-200'
                )}
              >
                <MessageSquare className="w-4 h-4 flex-shrink-0" />
              </button>

              {/* 管理员按钮 - 仅 admin 且非移动端显示 */}
              {showExpertAdmin && (
                <button
                  onClick={() => handleMenuClick('/admin/experts')}
                  className={cn(
                    'h-9 w-9 transition-all duration-200 justify-center p-0 rounded-full border-2',
                    isOnAdmin
                      ? 'bg-[var(--accent-hover)] text-black border-[var(--border-color)] shadow-[4px_4px_0_0_var(--shadow-color)]'
                      : 'border-[var(--border-color)] text-slate-400 hover:bg-[var(--bg-page)] hover:text-gray-700 dark:hover:text-slate-200'
                  )}
                >
                  <Shield className="w-4 h-4 flex-shrink-0" />
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 w-full flex flex-col overflow-hidden">
            {/* 主菜单 - 首页、知识库、历史记录 - 固定不滚动 */}
            <div className="shrink-0 flex flex-col items-center py-2">
              {/* 导航标题 */}
              <div className="px-1 py-2 w-[230px]">
                <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-mono text-[10px]">
                  /// Navigation
                </h3>
              </div>
              {/* 首页按钮 */}
              <button
                onClick={() => handleMenuClick('/')}
                className={cn(
                  'h-[44px] transition-all duration-200 justify-center py-0 w-[230px] border-2 mb-1',
                  isOnHome
                    ? 'bg-[var(--accent-hover)] text-black border-[var(--border-color)] shadow-[4px_4px_0_0_var(--shadow-color)]'
                    : 'border-transparent text-[var(--text-primary)] hover:bg-[var(--bg-page)] hover:border-[var(--border-color)]'
                )}
              >
                <div className="flex items-center gap-3 px-3">
                  <Home className="w-5 h-5 flex-shrink-0" />
                  <span className="font-mono text-xs font-bold tracking-wide uppercase">{t('navDashboard')}</span>
                </div>
              </button>

              {/* 知识库按钮 */}
              <button
                onClick={() => handleMenuClick('/knowledge')}
                className={cn(
                  'h-[44px] transition-all duration-200 justify-center py-0 w-[230px] border-2 mb-1',
                  isOnKnowledge
                    ? 'bg-[var(--accent-hover)] text-black border-[var(--border-color)] shadow-[4px_4px_0_0_var(--shadow-color)]'
                    : 'border-transparent text-[var(--text-primary)] hover:bg-[var(--bg-page)] hover:border-[var(--border-color)]'
                )}
              >
                <div className="flex items-center gap-3 px-3">
                  <Database className="w-5 h-5 flex-shrink-0" />
                  <span className="font-mono text-xs font-bold tracking-wide uppercase">{t('knowledgeBase')}</span>
                </div>
              </button>

              {/* 历史记录按钮 */}
              <button
                onClick={() => handleMenuClick('/history')}
                className={cn(
                  'h-[44px] transition-all duration-200 justify-center py-0 w-[230px] border-2 mb-1',
                  isOnHistory
                    ? 'bg-[var(--accent-hover)] text-black border-[var(--border-color)] shadow-[4px_4px_0_0_var(--shadow-color)]'
                    : 'border-transparent text-[var(--text-primary)] hover:bg-[var(--bg-page)] hover:border-[var(--border-color)]'
                )}
              >
                <div className="flex items-center gap-3 px-3">
                  <MessageSquare className="w-5 h-5 flex-shrink-0" />
                  <span className="font-mono text-xs font-bold tracking-wide uppercase">{t('history')}</span>
                </div>
              </button>

              {/* 管理员按钮 - 仅 admin 且非移动端显示 */}
              {showExpertAdmin && (
                <button
                  onClick={() => handleMenuClick('/admin/experts')}
                  className={cn(
                    'h-[44px] transition-all duration-200 justify-center py-0 w-[230px] border-2',
                    isOnAdmin
                      ? 'bg-[var(--accent-hover)] text-black border-[var(--border-color)] shadow-[4px_4px_0_0_var(--shadow-color)]'
                      : 'border-transparent text-[var(--text-primary)] hover:bg-[var(--bg-page)] hover:border-[var(--border-color)]'
                  )}
                >
                  <div className="flex items-center gap-3 px-3">
                    <Shield className="w-5 h-5 flex-shrink-0" />
                    <span className="font-mono text-xs font-bold tracking-wide uppercase">{t('navExperts')}</span>
                  </div>
                </button>
              )}
            </div>

            {/* 最近会话列表 - Data Log 风格 - 独立滚动区域 */}
            <div className="flex-1 min-h-0 flex flex-col py-4 overflow-hidden w-full">
              {/* 小标题: 模拟终端注释 - 左对齐 */}
              <div className="px-4 mb-2 flex items-center gap-2 opacity-50 w-[230px] mx-auto">
                <div className="w-1.5 h-1.5 bg-[var(--text-secondary)]"></div>
                <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">
                  /// {t('memoryDump')}
                </span>
              </div>

              {/* 滚动区域: Bauhaus风格滚动条 - 最大高度显示5条，超出滚动 */}
              <div className="overflow-y-auto px-3 space-y-1 w-[230px] mx-auto bauhaus-scrollbar" style={{ maxHeight: '220px' }}>
                {/* 列表项: 极简、紧凑、数据感 */}
                {recentConversations.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => handleConversationClick(conv.id, conv.agent_id)}
                    className="group w-full text-left flex items-center gap-3 px-3 py-1.5 border border-transparent hover:border-[var(--border-color)] hover:bg-[var(--bg-page)] transition-all"
                  >
                    {/* 装饰性光标: Hover时出现 */}
                    <span className="text-[var(--accent-hover)] font-black text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                      &gt;
                    </span>

                    <div className="flex-1 min-w-0">
                      {/* 标题: 等宽字体，像日志 */}
                      <div className="font-mono text-[11px] font-bold text-[var(--text-secondary)] truncate group-hover:text-[var(--text-primary)] transition-colors">
                        {conv.title || t('newChat')}
                      </div>
                      {/* 时间: 极小字体 */}
                      <div className="font-mono text-[9px] text-[var(--text-secondary)] opacity-50 truncate">
                        LOG_ID: {conv.id.slice(0, 6)} • {formatRelativeTime(conv.updated_at)}
                      </div>
                    </div>
                  </button>
                ))}

                {/* 如果没有会话，显示空状态 */}
                {recentConversations.length === 0 && (
                  <div className="px-3 py-2 font-mono text-[10px] text-[var(--text-secondary)] opacity-40">
                    {t('noDataStream')}
                  </div>
                )}
              </div>

              {/* 底部渐变遮罩: 提示还有更多内容 */}
              <div className="h-4 bg-gradient-to-t from-[var(--bg-card)] to-transparent pointer-events-none shrink-0 w-[230px] mx-auto" />
            </div>
        </div>
      )}
      </div>

      {/* 底部用户区域 - Bauhaus风格 */}
      <div className={cn(
        'border-t-2 border-[var(--border-color)] shrink-0',
        isCollapsed ? 'p-2 flex flex-col items-center gap-2' : 'p-3'
      )}>
        {isAuthenticated ? (
          // 已登录状态 - 显示用户头像
          isCollapsed ? (
            <div className="flex flex-col items-center gap-2">
              <div
                onClick={() => setIsSettingsMenuOpen(!isSettingsMenuOpen)}
                data-avatar-button=""
                className="flex items-center justify-center cursor-pointer transition-all duration-200 hover:bg-[var(--bg-page)] rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
              >
                <Avatar className="h-8 w-8 border-2 border-[var(--border-color)] shadow-[var(--shadow-color)_2px_2px_0_0]">
                  <AvatarImage src={avatar} alt="Avatar" />
                  <AvatarFallback className="bg-gradient-to-br from-violet-500 to-blue-600 text-[10px] font-bold text-white">
                    {getAvatarDisplay(avatar || '', username)}
                  </AvatarFallback>
                </Avatar>
              </div>
              {/* 展开按钮 - Bauhaus风格 */}
              {onToggleCollapsed && (
                <button
                  onClick={onToggleCollapsed}
                  className="p-1.5 border-2 border-[var(--border-color)] bg-[var(--bg-page)] shadow-[var(--shadow-color)_2px_2px_0_0] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[var(--shadow-color)_3px_3px_0_0]"
                  title="展开侧边栏"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ) : (
            <div className="relative group cursor-pointer w-[230px] mx-auto mb-2">
              <div className="absolute inset-0 bg-[var(--shadow-color)] translate-x-1 translate-y-1 transition-transform group-hover:translate-x-2 group-hover:translate-y-2"></div>
              <div
                onClick={() => setIsSettingsMenuOpen(!isSettingsMenuOpen)}
                data-avatar-button=""
                className="relative flex items-center gap-3 px-4 py-3 border-2 border-[var(--border-color)] bg-[var(--bg-page)] z-10 transition-all"
                style={{ width: '230px', height: '63px' }}
              >
                {/* 头像 */}
                {avatar ? (
                  <img src={avatar} alt="Avatar" className="w-8 h-8 border-2 border-[var(--border-color)] shrink-0" />
                ) : (
                  <div className="w-8 h-8 bg-[var(--text-primary)] text-[var(--bg-card)] flex items-center justify-center font-bold text-sm shrink-0 border-2 border-[var(--border-color)]">
                    {username.charAt(0).toUpperCase()}
                  </div>
                )}
                {/* 名字 */}
                <div className="flex-1">
                  <div className="font-bold text-sm uppercase" title={username}>
                    {username}
                  </div>
                  <div className="text-[10px] font-mono text-[var(--text-secondary)]">
                    PLAN: {planLabel}
                  </div>
                </div>
                {/* 状态指示点 */}
                <div className="w-2 h-2 bg-green-500 rounded-full border border-[var(--border-color)] shrink-0"></div>
              </div>
            </div>
          )
        ) : (
          // 未登录状态 - 显示登录按钮
          isCollapsed ? (
            <button
              onClick={() => setIsLoginDialogOpen(true)}
              className="p-2 border-2 border-[var(--border-color)] bg-[var(--accent-hover)] text-black shadow-[var(--shadow-color)_2px_2px_0_0] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[var(--shadow-color)_3px_3px_0_0] transition-all"
              title="登录"
            >
              <User className="w-5 h-5" />
            </button>
          ) : (
            <div className="relative group w-[230px] mx-auto">
              <div className="absolute inset-0 bg-[var(--shadow-color)] translate-x-1 translate-y-1 transition-transform group-hover:translate-x-2 group-hover:translate-y-2"></div>
              <button
                onClick={() => setIsLoginDialogOpen(true)}
                className="relative w-full flex items-center justify-center gap-3 px-4 py-3 border-2 border-[var(--border-color)] bg-[var(--accent-hover)] text-black z-10 transition-all font-bold font-mono text-sm uppercase"
              >
                <User className="w-5 h-5" />
                <span>登录 / LOGIN</span>
              </button>
            </div>
          )
        )}
      </div>

      {/* 设置弹出菜单 - Portal - Bauhaus风格 */}
      {isSettingsMenuOpen && createPortal(
        <div
          data-settings-menu
          className="fixed bottom-[60px] bg-[var(--bg-card)] backdrop-blur-2xl border-2 border-[var(--border-color)] shadow-[var(--shadow-color)_4px_4px_0_0] z-[200] mb-4 animate-in fade-in zoom-in-95 slide-in-from-bottom-2"
          style={{
            width: '280px',
            maxWidth: 'calc(100vw - 32px)',
            left: '32px',
          }}
        >
          <div className="p-4 space-y-2">
            {/* 用户信息 */}
            <div className="pb-3 border-b-2 border-[var(--border-color)]">
              <div className="font-mono text-[10px] text-[var(--text-secondary)] mb-2">
                /// {t('userSettings')}
              </div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  {avatar ? (
                    <img src={avatar} alt="Avatar" className="w-10 h-10 border-2 border-[var(--border-color)] shadow-[var(--shadow-color)_2px_2px_0_0]" />
                  ) : (
                    <div className="w-10 h-10 bg-[var(--text-primary)] text-[var(--bg-card)] flex items-center justify-center font-bold border-2 border-[var(--border-color)] shadow-[var(--shadow-color)_2px_2px_0_0]">
                      {username.charAt(0).toUpperCase()}
                    </div>
                  )}
                  {/* 套餐图标 - Bauhaus方形风格 */}
                  <div className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 border-2 border-[var(--border-color)] bg-[var(--bg-card)] flex items-center justify-center shadow-sm">
                    {currentPlan === 'Free' && <Star className="w-1.5 h-1.5 text-purple-500" />}
                    {currentPlan === 'Pilot' && <Plane className="w-1.5 h-1.5 text-cyan-500" />}
                    {currentPlan === 'Maestro' && <Crown className="w-1.5 h-1.5 text-amber-500" />}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm truncate">{username}</div>
                  <div className="text-[10px] font-mono text-[var(--text-secondary)] uppercase">
                    {isAuthenticated ? (user?.plan || 'Free') : 'Guest'}
                  </div>
                </div>
              </div>
            </div>

            {/* 设置选项 - Bauhaus风格 */}
            <button
              onClick={() => {
                onPersonalSettingsClick?.()
                setIsSettingsMenuOpen(false)
                onMobileClose?.()
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 border-2 border-[var(--border-color)] hover:bg-[var(--accent-hover)] hover:text-black transition-all font-mono text-xs shadow-[var(--shadow-color)_2px_2px_0_0] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[var(--shadow-color)_3px_3px_0_0] active:translate-x-0 active:translate-y-0 active:shadow-[var(--shadow-color)_2px_2px_0_0]"
            >
              <User className="w-4 h-4" />
              <span className="font-bold uppercase">{t('personalSettings')}</span>
            </button>

            <button
              onClick={() => {
                onSettingsClick?.()
                setIsSettingsMenuOpen(false)
                onMobileClose?.()
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 border-2 border-[var(--border-color)] hover:bg-[var(--accent-hover)] hover:text-black transition-all font-mono text-xs shadow-[var(--shadow-color)_2px_2px_0_0] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[var(--shadow-color)_3px_3px_0_0] active:translate-x-0 active:translate-y-0 active:shadow-[var(--shadow-color)_2px_2px_0_0]"
            >
              <Cog className="w-4 h-4" />
              <span className="font-bold uppercase">{t('modelConfig')}</span>
            </button>

            {/* 语言切换 - Bauhaus风格 水平排列 */}
            <div className="pt-1">
              <div className="font-mono text-[10px] text-[var(--text-secondary)] uppercase px-1 mb-2">
                /// {t('language')}
              </div>
              <div className="grid grid-cols-3 gap-1">
                {(['zh', 'en', 'ja'] as const).map((lang) => (
                  <button
                    key={lang}
                    onClick={() => {
                      setLanguage(lang)
                      // 语言切换后不关闭菜单，让用户看到切换效果
                    }}
                    className={cn(
                      'flex items-center justify-center gap-1.5 px-2 py-2 border-2 font-mono text-[10px] font-bold uppercase transition-all',
                      language === lang
                        ? 'bg-[var(--accent-hover)] text-black border-black'
                        : 'border-[var(--border-color)] hover:border-[var(--text-secondary)] text-[var(--text-primary)]'
                    )}
                  >
                    <span className={cn(
                      'w-1.5 h-1.5 rounded-full',
                      language === lang ? 'bg-black' : 'bg-[var(--text-secondary)]'
                    )} />
                    {lang === 'zh' ? '中文' : lang === 'en' ? 'EN' : '日本語'}
                  </button>
                ))}
              </div>
            </div>

            {/* 退出登录 - 统一风格 */}
            {isAuthenticated && (
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-3 py-2.5 border-2 border-[var(--border-color)] hover:bg-[var(--accent-hover)] hover:text-black transition-all font-mono text-xs text-[var(--text-primary)] shadow-[var(--shadow-color)_2px_2px_0_0] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[var(--shadow-color)_3px_3px_0_0] active:translate-x-0 active:translate-y-0 active:shadow-[var(--shadow-color)_2px_2px_0_0] mt-2"
              >
                <ArrowRight className="w-4 h-4" />
                <span className="font-bold uppercase">{t('logout')}</span>
              </button>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* 登录弹窗 - 使用现有功能 */}
      <LoginDialog
        open={isLoginDialogOpen}
        onOpenChange={setIsLoginDialogOpen}
        onSuccess={handleLoginSuccess}
      />
    </div>
  )
}
