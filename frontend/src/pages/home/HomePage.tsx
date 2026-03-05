import { useState, useMemo, useCallback } from 'react'
import { Bot, Plus, Code2, FileText, Zap, Menu, Paperclip, ArrowRight, Image, Trash2, Pencil } from 'lucide-react'
import { useTranslation } from '@/i18n'
import { useChatStore } from '@/store/chatStore'
import { useTaskStore } from '@/store/taskStore'
import { useIsAuthenticated } from '@/hooks'
import { DeleteConfirmDialog } from '@/components/settings/DeleteConfirmDialog'
import { useNavigate, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import type { Agent, Conversation } from '@/types'
import { SYSTEM_AGENTS, getSystemAgentName } from '@/constants/agents'
import { logger } from '@/utils/logger'
import { useAppUISelectors } from '@/hooks'
import { useCustomAgentsQuery, useDeleteAgentMutation, useRecentConversationsQuery } from '@/hooks/queries'

// shadcn Components
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

// Bauhaus Components (shadcn 没有的功能)
import {
  SystemStatusMarquee,
  NoiseOverlay,
  GridPattern,
} from '@/components/bauhaus'

// Scene Card Component
function SceneCard({
  number,
  icon: Icon,
  title,
  subtitle,
  tag,
  onClick,
}: {
  number: string
  icon: React.ElementType
  title: string
  subtitle: string
  tag: string
  onClick?: () => void
}) {
  return (
    <Card
      onClick={onClick}
      className="p-5 cursor-pointer group flex flex-col justify-between h-44 relative overflow-hidden"
    >
      {/* 编号 - 右上角 */}
      <div className="absolute top-0 right-0 p-2 font-mono text-[10px] font-bold opacity-30">
        {number}
      </div>

      {/* 右下角倒角装饰 */}
      <div className="absolute bottom-0 right-0 w-0 h-0 border-b-[20px] border-r-[20px] border-b-accent-hover border-r-transparent transition-all duration-300 group-hover:border-b-[40px] group-hover:border-r-[40px]" />

      <div className="flex justify-between items-start">
        <div className="p-2 border-2 border-border bg-surface-page group-hover:bg-surface-card transition-colors">
          <Icon className="w-6 h-6 stroke-[2.5]" />
        </div>
        <div className="font-mono text-[10px] bg-content-primary text-surface-page px-1">{tag}</div>
      </div>
      <div>
        <h4 className="font-black text-lg mb-1 group-hover:underline decoration-2 underline-offset-4">{title}</h4>
        <p className="text-xs font-mono text-content-secondary leading-tight">{subtitle}</p>
      </div>
    </Card>
  )
}

// Construct Card Component
function ConstructCard({
  name,
  type,
  status,
  tags,
  sideColor,
  onClick,
  onDelete,
  onEdit,
}: {
  name: string
  type: string
  status: 'online' | 'offline'
  tags: string[]
  sideColor: string
  onClick?: () => void
  onDelete?: () => void
  onEdit?: () => void
}) {
  const { t } = useTranslation()

  return (
    <Card
      className="p-0 cursor-pointer group h-44 flex relative overflow-hidden"
    >
      {/* 左侧色条 */}
      <div
        className="w-4 h-full border-r-2 border-border z-10 flex flex-col items-center justify-center gap-1 py-2 transition-colors"
        style={{ backgroundColor: sideColor }}
      >
        <div className="w-1 h-1 bg-surface-card rounded-full" />
        <div className="w-1 h-1 bg-surface-card rounded-full" />
        <div className="w-1 h-1 bg-surface-card rounded-full" />
      </div>

      <div className="p-5 flex-1 flex flex-col justify-between z-10 relative" onClick={onClick}>
        {/* 编辑和删除按钮 - hover 时显示在右上角 */}
        <div className="absolute top-2 right-2 flex gap-1 z-20 opacity-0 group-hover:opacity-100 transition-all duration-150">
          {onEdit && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onEdit()
              }}
              className={cn(
                "w-7 h-7 border-2 border-border bg-surface-page",
                "flex items-center justify-center",
                "hover:bg-accent-hover hover:text-content-primary hover:border-accent-hover",
                "transition-all duration-150",
                "shadow-hard-sm",
                "active:shadow-none active:translate-x-[1px] active:translate-y-[1px]"
              )}
              title={t('edit')}
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDelete()
              }}
              className={cn(
                "w-7 h-7 border-2 border-border bg-surface-page",
                "flex items-center justify-center",
                "hover:bg-red-500 hover:text-white hover:border-red-500",
                "transition-all duration-150",
                "shadow-hard-sm",
                "active:shadow-none active:translate-x-[1px] active:translate-y-[1px]"
              )}
              title={t('delete')}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex justify-between items-start pr-8">
          <h4 className="font-black text-xl tracking-tight">
            {name}
          </h4>
          <div className="flex items-center gap-1 border border-border px-1 bg-surface-page">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <span className="font-mono text-[9px] font-bold">
              {t('online')}
            </span>
          </div>
        </div>
        <div>
          <p className="font-mono text-xs text-content-secondary mb-3">/// {type}</p>
          <div className="flex gap-1 flex-wrap">
            {tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 text-[9px] font-bold border border-border bg-surface-page"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Card>
  )
}

// Create New Card Component
function CreateNewCard({ onClick }: { onClick?: () => void }) {
  const { t } = useTranslation()
  return (
    <div
      onClick={onClick}
      className="border-2 border-dashed border-content-secondary p-6 cursor-pointer group flex flex-col items-center justify-center h-44 bg-transparent hover:bg-surface-card hover:border-solid hover:border-accent-hover hover:shadow-hard-accent-lg transition-all"
    >
      <div className="w-12 h-12 border-2 border-content-primary flex items-center justify-center mb-4 text-3xl group-hover:bg-accent-hover group-hover:border-accent-hover group-hover:text-content-primary transition-colors bg-surface-page">
        +
      </div>
      <span className="font-bold font-mono uppercase tracking-wider text-sm group-hover:text-content-primary">
        {t('initializeNew')}
      </span>
    </div>
  )
}

export default function HomePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  // 判断当前页面
  const isOnHome = location.pathname === '/'

  const {
    selectedAgentId,
    setSelectedAgentId,
  } = useChatStore()

  const { sidebar, dialogs } = useAppUISelectors()

  const [inputMessage, setInputMessage] = useState('')

  // 删除确认对话框状态
  const [deletingAgentId, setDeletingAgentId] = useState<string | null>(null)
  const [deletingAgentName, setDeletingAgentName] = useState<string>('')

  // 获取登录状态和登录弹窗控制
  const isAuthenticated = useIsAuthenticated()
  const openLogin = dialogs.openLogin

  // 👈 使用 React Query 获取自定义智能体列表（自动缓存，30分钟内不会重复请求）
  // 只有登录后才发起请求
  const { data: customAgents = [], refetch: refetchAgents } = useCustomAgentsQuery({ enabled: isAuthenticated })

  // 👈 使用 React Query 获取会话列表（返回数组格式）
  // 只有登录后才发起请求
  const { data: conversations = [] } = useRecentConversationsQuery(100, { enabled: isAuthenticated })

  // 👈 使用 React Query Mutation 删除智能体
  const deleteAgentMutation = useDeleteAgentMutation()

  // 监听路由变化，当从创建页面返回首页时重置状态
  // 注意：不需要手动刷新数据，React Query 会自动处理缓存
  // 但如果需要强制刷新，可以调用 refetchAgents()

  // 构建显示的智能体列表
  // 👈 注意：默认助手 (sys-default-chat) 不在列表中展示
  // 用户通过首页底部的输入框与默认助手交互，避免重复创建 thread
  const displayedAgents = useMemo<Agent[]>(() => {
    // 为 customAgents 添加图标（React Query 返回的数据没有 icon）
    const customAgentsWithIcon = customAgents.map(a => ({
      ...a,
      icon: <Bot className="w-5 h-5" />
    }))

    const createAgentCard: Agent = {
      id: 'create-agent-card',
      name: t('createAgent'),
      description: t('createAgentDesc'),
      icon: <Plus className="w-5 h-5" />,
      modelId: '',
      isDefault: false,
      isCreateCard: true
    }

    // 只展示：创建卡片 + 自定义智能体（不展示默认助手）
    return [createAgentCard, ...customAgentsWithIcon]
  }, [customAgents])

  // 点击智能体卡片 - 恢复该智能体的最近会话或创建新会话
  const handleAgentClick = useCallback(async (agentId: string) => {
    // 👈 先清空消息和 task 状态，避免显示旧会话的缓存
    useChatStore.getState().setMessages([])
    useTaskStore.getState().resetAll()
    useChatStore.getState().setSelectedAgentId(agentId)

    // 👈 默认助手：直接创建新会话（不查询历史）
    if (agentId === SYSTEM_AGENTS.DEFAULT_CHAT) {
      const newId = crypto.randomUUID()
      useChatStore.getState().setCurrentConversationId(newId)
      navigate(`/chat/${newId}`, { state: { isNew: true } })
      return
    }

    // 👈 自定义智能体：使用 React Query 缓存的会话数据
    // 过滤出该智能体的会话（按更新时间倒序）
    const agentConversations = conversations
      .filter((conv: Conversation) => conv.agent_id === agentId)
      .sort((a: Conversation, b: Conversation) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      )

    // 如果有历史会话，恢复最近的；否则创建新会话
    if (agentConversations.length > 0) {
      const latestConversation = agentConversations[0]
      logger.debug('找到历史会话:', latestConversation.id, '智能体:', agentId)
      useChatStore.getState().setCurrentConversationId(latestConversation.id)
      // 不传递 isNew，让聊天页面加载历史消息
      navigate(`/chat/${latestConversation.id}?agentId=${agentId}`)
    } else {
      // 没有历史会话，创建新会话
      const newId = crypto.randomUUID()
      useChatStore.getState().setCurrentConversationId(newId)
      logger.debug('创建新会话:', newId, '智能体:', agentId)
      navigate(`/chat/${newId}?agentId=${agentId}`, { state: { isNew: true } })
    }
  }, [navigate, conversations])

  const handleCreateAgent = useCallback(() => {
    // 🔐 未登录时弹出登录弹窗
    if (!isAuthenticated) {
      openLogin()
      return
    }
    navigate('/create-agent')
  }, [navigate, isAuthenticated, openLogin])

  // 处理删除自定义 agent
  const handleDeleteAgent = useCallback((agentId: string, agentName: string) => {
    setDeletingAgentId(agentId)
    setDeletingAgentName(agentName)
  }, [])

  // 确认删除操作 - 使用 React Query Mutation
  const handleConfirmDelete = useCallback(async () => {
    if (!deletingAgentId) return

    try {
      await deleteAgentMutation.mutateAsync(deletingAgentId)
      if (selectedAgentId === deletingAgentId) {
        setSelectedAgentId(SYSTEM_AGENTS.DEFAULT_CHAT)
      }
    } catch (error) {
      logger.error('删除自定义智能体失败:', error)
      // 即使失败也重置选中状态
      if (selectedAgentId === deletingAgentId) {
        setSelectedAgentId(SYSTEM_AGENTS.DEFAULT_CHAT)
      }
    } finally {
      setDeletingAgentId(null)
      setDeletingAgentName('')
    }
  }, [deletingAgentId, selectedAgentId, setSelectedAgentId, deleteAgentMutation])

  const handleSendMessage = useCallback(() => {
    if (!inputMessage.trim()) return

    // 🔐 未登录时弹出登录弹窗
    if (!isAuthenticated) {
      // 保存输入内容到 pendingMessage，登录后自动发送
      useChatStore.getState().setPendingMessage(inputMessage)
      openLogin()
      return
    }

    const newId = crypto.randomUUID()

    // 🔥🔥🔥 Server-Driven UI: 导航前直接清空 Store（事件驱动）
    // 避免 useEffect 复杂判断，确保新会话以干净状态开始
    useChatStore.getState().setMessages([])
    useChatStore.getState().setCurrentConversationId(null)
    useTaskStore.getState().resetAll()
    
    // 🔥 修复：首页始终使用默认助手，忽略残留的 selectedAgentId
    // 用户从首页输入内容 → 触发 AI 助手（复杂模式）
    // 用户点击自定义智能体卡片 → 才使用自定义智能体（简单模式）
    useChatStore.getState().setSelectedAgentId(SYSTEM_AGENTS.DEFAULT_CHAT)

    // 👈 直接导航到 /chat/:id 格式，首页始终使用默认助手
    navigate(`/chat/${newId}`, {
      state: { startWith: inputMessage, isNew: true }
    })
  }, [inputMessage, navigate, isAuthenticated, openLogin])

  // 推荐场景数据
  const scenes = [
    {
      number: '01',
      icon: Code2,
      title: 'Code Gen',
      subtitle: 'Python / JS / Rust',
      tag: 'DEV',
      onClick: () => {
        setInputMessage(t('sceneCodeGen'))
      },
    },
    {
      number: '02',
      icon: FileText,
      title: 'Deep Research',
      subtitle: 'Web Analysis & Summary',
      tag: 'RSRCH',
      onClick: () => {
        setInputMessage(t('sceneDeepResearch'))
      },
    },
    {
      number: '03',
      icon: Zap,
      title: 'Quick Q&A',
      subtitle: 'GPT-4o Instant',
      tag: 'FAST',
      onClick: () => {
        setInputMessage(t('sceneQuickQA'))
      },
    },
  ]

  return (
    <div className="h-full">
      {/* 网格背景 */}
      <GridPattern />

      {/* 移动端菜单按钮 */}
      <button
        onClick={sidebar.toggleMobile}
        className="lg:hidden fixed top-4 left-4 z-30 p-2 border-2 border-border bg-surface-card shadow-hard hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-hard-accent-sm active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
      >
        <Menu className="w-5 h-5 stroke-[2.5]" />
      </button>

      {/* Main Content */}
      <div className="flex-1 relative">
        {/* System Status Marquee */}
        <SystemStatusMarquee className="sticky top-0 z-10" />

        <div className="max-w-6xl mx-auto px-12 py-12 flex flex-col w-full">
          {/* Hero Section */}
          <div className="flex-none flex flex-col items-start justify-center mb-10 select-none">
            {/* 状态标签 - 左上角 */}
            <div className="flex gap-2 mb-4">
              <span className="px-2 py-1 text-[10px] font-mono font-bold border border-border bg-accent-hover text-content-primary shadow-hard-sm">
                READY
              </span>
              <span className="px-2 py-1 text-[10px] font-mono font-bold border border-border text-content-secondary">
                IDLE
              </span>
            </div>

            {/* The Monolith Style Slogan */}
            <div className="flex flex-col leading-none tracking-tighter">
              <h2 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-black text-content-primary">
                INFINITE MINDS.
              </h2>
              <h2 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-black text-accent-hover">
                ONE POUCH.
              </h2>
            </div>
          </div>

          {/* Command Input */}
          <div className="flex-none mb-16 relative group">
            <div className="absolute -top-3 left-4 bg-surface-page px-2 font-mono text-xs font-bold border-2 border-border z-20 text-content-secondary">
              {t('commandInput')}
            </div>

            {/* Shadow Layer */}
            <div className="absolute inset-0 bg-[rgb(var(--shadow-color))] translate-x-2 translate-y-2 group-focus-within:translate-x-3 group-focus-within:translate-y-3 group-focus-within:bg-accent-hover transition-all" />

            {/* Input Container */}
            <div className="relative border-2 border-border bg-surface-card flex flex-col">
              {/* Textarea with Line Numbers */}
              <div className="flex-1 relative flex">
                {/* Line Numbers */}
                <div className="flex-none w-12 py-6 pl-4 border-r-2 border-border">
                  <div className="font-mono text-sm text-content-secondary opacity-30 select-none leading-relaxed">
                    01<br />02<br />03
                  </div>
                </div>

                {/* Textarea */}
                <textarea
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSendMessage()
                    }
                  }}
                  placeholder={t('inputPlaceholder')}
                  className="flex-1 w-full min-h-[180px] max-h-[300px] bg-transparent px-6 py-6 text-[20px] leading-[28px] font-bold font-mono text-content-primary placeholder:text-content-secondary focus:outline-none focus:ring-0 border-none resize-none z-10 relative"
                />
              </div>

              {/* Toolbar */}
              <div className="flex justify-between items-center p-2 sm:p-3 border-t-2 border-border bg-surface-page gap-2">
                <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                  {/* 附件按钮 */}
                  <div className="flex gap-1 flex-shrink-0">
                    <button className="p-1.5 sm:p-2 border-2 border-transparent hover:bg-surface-card hover:border-border transition-all">
                      <Image className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.5]" />
                    </button>
                    <button className="p-1.5 sm:p-2 border-2 border-transparent hover:bg-surface-card hover:border-border transition-all">
                      <Paperclip className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.5]" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
                  <span className="font-mono text-[10px] text-content-secondary hidden sm:inline">ENTER TO SEND</span>
                  <Button
                    onClick={handleSendMessage}
                    disabled={!inputMessage.trim()}
                    className="px-2 sm:px-4 md:px-6 py-1.5 sm:py-2 flex items-center gap-1 sm:gap-2 text-xs sm:text-sm"
                  >
                    <span className="hidden sm:inline">{t('execute')}</span>
                    <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.5]" />
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Recommended Section */}
          <div className="space-y-12 pb-10">
            <div>
              <div className="flex justify-between items-end mb-6 border-b-2 border-border pb-2 w-full">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 bg-accent-hover border border-border" />
                  <h3 className="text-sm font-black uppercase tracking-widest">{t('recommended')}</h3>
                </div>
                <div className="font-mono text-[10px] text-content-secondary">SHOWING 3 OF 12</div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {scenes.map((scene) => (
                  <SceneCard key={scene.number} {...scene} />
                ))}
              </div>
            </div>

            {/* My Constructs Section */}
            <div className="pt-8">
              <div className="flex justify-between items-end mb-6 border-b-2 border-border pb-2 w-full">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 bg-accent border border-border" />
                  <h3 className="text-sm font-black uppercase tracking-widest">{t('myConstructs')}</h3>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Create New Card */}
                <CreateNewCard onClick={handleCreateAgent} />

                {/* 👈 默认助手已移除：用户通过底部输入框与默认助手交互，避免重复创建 thread */}

                {/* Custom Agents */}
                {customAgents.map((agent) => (
                  <ConstructCard
                    key={agent.id}
                    name={agent.name}
                    type={(agent.category || 'CUSTOM').toUpperCase()}
                    status="offline"
                    tags={[(agent.category || 'AGENT').substring(0, 6).toUpperCase()]}
                    sideColor="#888888"
                    onClick={() => handleAgentClick(agent.id)}
                    onEdit={() => navigate(`/edit-agent/${agent.id}`)}
                    onDelete={() => handleDeleteAgent(agent.id, agent.name)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Noise Overlay */}
      <NoiseOverlay />

      {/* Delete Confirm Dialog */}
      <DeleteConfirmDialog
        isOpen={deletingAgentId !== null}
        onClose={() => {
          setDeletingAgentId(null)
          setDeletingAgentName('')
        }}
        onConfirm={handleConfirmDelete}
        title={t('confirmDeleteAgent')}
        description={t('deleteAgentWarning')}
        itemName={deletingAgentName}
      />
    </div>
  )
}
