import { useState, useEffect, useMemo, useCallback } from 'react'
import { Bot, Plus, Code2, FileText, Zap, Menu, Paperclip, ArrowRight, Image, Trash2 } from 'lucide-react'
import { useTranslation } from '@/i18n'
import { useChatStore } from '@/store/chatStore'
import { DeleteConfirmDialog } from '@/components/settings/DeleteConfirmDialog'
import { useNavigate, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { deleteCustomAgent, getAllAgents } from '@/services/agent'
import { getConversations } from '@/services/chat'
import type { Agent, Conversation } from '@/types'
import { SYSTEM_AGENTS, getSystemAgentName } from '@/constants/agents'
import { logger } from '@/utils/logger'
import { useApp } from '@/providers/AppProvider'

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
      <div className="absolute bottom-0 right-0 w-0 h-0 border-b-[20px] border-r-[20px] border-b-[var(--accent-hover)] border-r-transparent transition-all group-hover:border-b-[40px] group-hover:border-r-[40px]" />

      <div className="flex justify-between items-start">
        <div className="p-2 border-2 border-[var(--border-color)] bg-[var(--bg-page)] group-hover:bg-white transition-colors">
          <Icon className="w-6 h-6 stroke-[2.5]" />
        </div>
        <div className="font-mono text-[10px] bg-[var(--text-primary)] text-[var(--bg-page)] px-1">{tag}</div>
      </div>
      <div>
        <h4 className="font-black text-lg mb-1 group-hover:underline decoration-2 underline-offset-4">{title}</h4>
        <p className="text-xs font-mono text-[var(--text-secondary)] leading-tight">{subtitle}</p>
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
}: {
  name: string
  type: string
  status: 'online' | 'offline'
  tags: string[]
  sideColor: string
  onClick?: () => void
  onDelete?: () => void
}) {
  const { t } = useTranslation()

  return (
    <Card
      className="p-0 cursor-pointer group h-44 flex relative overflow-hidden"
    >
      {/* 左侧色条 */}
      <div
        className="w-4 h-full border-r-2 border-[var(--border-color)] z-10 flex flex-col items-center justify-center gap-1 py-2 transition-colors"
        style={{ backgroundColor: sideColor }}
      >
        <div className="w-1 h-1 bg-[var(--bg-card)] rounded-full" />
        <div className="w-1 h-1 bg-[var(--bg-card)] rounded-full" />
        <div className="w-1 h-1 bg-[var(--bg-card)] rounded-full" />
      </div>

      <div className="p-5 flex-1 flex flex-col justify-between z-10 relative" onClick={onClick}>
        {/* 删除按钮 - hover 时显示在右上角 */}
        {onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            className={cn(
              "absolute top-2 right-2 w-7 h-7 border-2 border-[var(--border-color)] bg-[var(--bg-page)]",
              "flex items-center justify-center z-20",
              "opacity-0 group-hover:opacity-100",
              "hover:bg-red-500 hover:text-white hover:border-red-500",
              "transition-all duration-150",
              "shadow-[2px_2px_0_0_var(--shadow-color)]",
              "active:shadow-none active:translate-x-[1px] active:translate-y-[1px]"
            )}
            title={t('delete')}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}

        <div className="flex justify-between items-start pr-8">
          <h4 className="font-black text-xl tracking-tight">
            {name}
          </h4>
          <div className="flex items-center gap-1 border border-[var(--border-color)] px-1 bg-[var(--bg-page)]">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <span className="font-mono text-[9px] font-bold">
              {t('online')}
            </span>
          </div>
        </div>
        <div>
          <p className="font-mono text-xs text-[var(--text-secondary)] mb-3">/// {type}</p>
          <div className="flex gap-1 flex-wrap">
            {tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 text-[9px] font-bold border border-[var(--border-color)] bg-[var(--bg-page)]"
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
      className="border-2 border-dashed border-[var(--text-secondary)] p-6 cursor-pointer group flex flex-col items-center justify-center h-44 bg-transparent hover:bg-[var(--bg-card)] hover:border-solid hover:border-[var(--accent-hover)] hover:shadow-[8px_8px_0_0_var(--accent-hover)] transition-all"
    >
      <div className="w-12 h-12 border-2 border-[var(--text-primary)] flex items-center justify-center mb-4 text-3xl group-hover:bg-[var(--accent-hover)] group-hover:border-[var(--accent-hover)] group-hover:text-black transition-colors bg-[var(--bg-page)]">
        +
      </div>
      <span className="font-bold font-mono uppercase tracking-wider text-sm group-hover:text-[var(--text-primary)]">
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
  const isOnKnowledge = location.pathname === '/knowledge'
  const isOnHistory = location.pathname === '/history'

  const {
    selectedAgentId,
    setSelectedAgentId,
    customAgents,
    setCustomAgents
  } = useChatStore()

  const { sidebar } = useApp()

  // 刷新自定义智能体列表的状态
  const [refreshKey, setRefreshKey] = useState(0)

  const [inputMessage, setInputMessage] = useState('')

  // 删除确认对话框状态
  const [deletingAgentId, setDeletingAgentId] = useState<string | null>(null)
  const [deletingAgentName, setDeletingAgentName] = useState<string>('')

  // 👈 从后端加载自定义智能体列表（使用缓存防止重复请求）
  useEffect(() => {
    const store = useChatStore.getState()
    
    // 检查是否应该发起请求
    if (!store.shouldFetchAgents()) {
      // 使用缓存数据
      if (store.agentsCache && store.agentsCache.length > 0) {
        setCustomAgents(store.agentsCache)
      }
      return
    }
    
    const loadCustomAgents = async () => {
      store.setLoadingAgents(true)
      try {
        const response = await getAllAgents()
        const customAgentsData = response
          .filter(agent => !agent.is_default)
          .map(agent => ({
            id: agent.id,
            name: agent.name,
            description: agent.description || '',
            icon: <Bot className="w-5 h-5" />,
            systemPrompt: agent.system_prompt,
            category: agent.category,
            modelId: agent.model_id,
            isCustom: true,
            is_builtin: false
          }))
        // 更新缓存和状态
        store.setAgentsCache(customAgentsData)
        setCustomAgents(customAgentsData)
      } catch (error) {
        logger.error('加载自定义智能体失败:', error)
      } finally {
        store.setLoadingAgents(false)
      }
    }

    loadCustomAgents()
  }, [refreshKey, setCustomAgents])

  // 监听路由变化，当从创建页面返回首页时重置状态
  useEffect(() => {
    if (location.pathname === '/') {
      setRefreshKey(prev => prev + 1)
      setSelectedAgentId(SYSTEM_AGENTS.DEFAULT_CHAT)
    }
  }, [location.pathname, setSelectedAgentId])

  // 构建显示的智能体列表
  // 👈 注意：默认助手 (sys-default-chat) 不在列表中展示
  // 用户通过首页底部的输入框与默认助手交互，避免重复创建 thread
  const displayedAgents = useMemo<Agent[]>(() => {
    const customAgentsWithIcon = customAgents.map(a => ({
      ...a,
      icon: <Bot className="w-5 h-5" />
    }))

    const createAgentCard: Agent = {
      id: 'create-agent-card',
      name: '创建智能体',
      description: '自定义属于你的专属智能体',
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
    // 👈 先清空消息，避免显示旧会话的缓存
    useChatStore.getState().setMessages([])
    useChatStore.getState().setSelectedAgentId(agentId)

    // 👈 默认助手：直接创建新会话（不查询历史）
    if (agentId === SYSTEM_AGENTS.DEFAULT_CHAT) {
      const newId = crypto.randomUUID()
      useChatStore.getState().setCurrentConversationId(newId)
      navigate(`/chat/${newId}`, { state: { isNew: true } })
      return
    }

    // 👈 自定义智能体：查询历史会话，恢复最近的会话（使用缓存）
    try {
      const store = useChatStore.getState()
      let conversations: Conversation[]

      // 1. 优先使用缓存，缓存不存在或过期则发起请求
      if (store.conversationsCache && !store.shouldFetchConversations()) {
        conversations = store.conversationsCache
      } else {
        store.setLoadingConversations(true)
        conversations = await getConversations()
        store.setConversationsCache(conversations)
        store.setLoadingConversations(false)
      }

      // 2. 过滤出该智能体的会话（按更新时间倒序）
      const agentConversations = conversations
        .filter((conv: Conversation) => conv.agent_id === agentId)
        .sort((a: Conversation, b: Conversation) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        )

      // 3. 如果有历史会话，恢复最近的；否则创建新会话
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
    } catch (error) {
      // 查询失败，降级为创建新会话
      logger.error('查询历史会话失败:', error)
      const newId = crypto.randomUUID()
      useChatStore.getState().setCurrentConversationId(newId)
      navigate(`/chat/${newId}?agentId=${agentId}`, { state: { isNew: true } })
    }
  }, [navigate])

  const handleCreateAgent = useCallback(() => {
    navigate('/create-agent')
  }, [navigate])

  // 处理删除自定义 agent
  const handleDeleteAgent = useCallback((agentId: string, agentName: string) => {
    setDeletingAgentId(agentId)
    setDeletingAgentName(agentName)
  }, [])

  // 确认删除操作
  const handleConfirmDelete = useCallback(async () => {
    if (!deletingAgentId) return

    try {
      await deleteCustomAgent(deletingAgentId)
      setCustomAgents(prev => prev.filter(agent => agent.id !== deletingAgentId))
      if (selectedAgentId === deletingAgentId) {
        setSelectedAgentId(SYSTEM_AGENTS.DEFAULT_CHAT)
      }
    } catch (error) {
      logger.error('删除自定义智能体失败:', error)
      setCustomAgents(prev => prev.filter(agent => agent.id !== deletingAgentId))
      if (selectedAgentId === deletingAgentId) {
        setSelectedAgentId(SYSTEM_AGENTS.DEFAULT_CHAT)
      }
    } finally {
      setDeletingAgentId(null)
      setDeletingAgentName('')
    }
  }, [deletingAgentId, selectedAgentId, setCustomAgents, setSelectedAgentId])

  const handleSendMessage = useCallback(() => {
    if (!inputMessage.trim()) return

    const newId = crypto.randomUUID()

    // 统一使用 Orchestrator 接口（后端自动路由）
    const agentId = selectedAgentId || SYSTEM_AGENTS.DEFAULT_CHAT

    // 👈 直接导航到 /chat/:id 格式，不使用查询参数
    // 默认助手：纯净 URL /chat/:id
    // 自定义智能体：/chat/:id?agentId=xxx
    if (agentId !== SYSTEM_AGENTS.DEFAULT_CHAT) {
      navigate(`/chat/${newId}?agentId=${agentId}`, {
        state: { startWith: inputMessage, isNew: true }
      })
    } else {
      navigate(`/chat/${newId}`, {
        state: { startWith: inputMessage, isNew: true }
      })
    }
  }, [inputMessage, navigate, selectedAgentId])

  // 推荐场景数据
  const scenes = [
    {
      number: '01',
      icon: Code2,
      title: 'Code Gen',
      subtitle: 'Python / JS / Rust',
      tag: 'DEV',
      onClick: () => {
        setInputMessage('帮我编写一个React组件')
      },
    },
    {
      number: '02',
      icon: FileText,
      title: 'Deep Research',
      subtitle: 'Web Analysis & Summary',
      tag: 'RSRCH',
      onClick: () => {
        setInputMessage('帮我调研一下最新的前端技术趋势')
      },
    },
    {
      number: '03',
      icon: Zap,
      title: 'Quick Q&A',
      subtitle: 'GPT-4o Instant',
      tag: 'FAST',
      onClick: () => {
        setInputMessage('今天天气怎么样？')
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
        className="lg:hidden fixed top-4 left-4 z-30 p-2 border-2 border-[var(--border-color)] bg-[var(--bg-card)] shadow-[var(--shadow-color)_4px_4px_0_0] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[var(--accent-hover)_2px_2px_0_0] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
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
              <span className="px-2 py-1 text-[10px] font-mono font-bold border border-[var(--border-color)] bg-[var(--accent-hover)] text-black shadow-[2px_2px_0_0_var(--shadow-color)]">
                READY
              </span>
              <span className="px-2 py-1 text-[10px] font-mono font-bold border border-[var(--border-color)] text-[var(--text-secondary)]">
                IDLE
              </span>
            </div>

            {/* The Monolith Style Slogan */}
            <div className="flex flex-col leading-none tracking-tighter">
              <h2 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-black text-[var(--text-primary)]">
                INFINITE MINDS.
              </h2>
              <h2 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-black text-[var(--accent-hover)]">
                ONE POUCH.
              </h2>
            </div>
          </div>

          {/* Command Input */}
          <div className="flex-none mb-16 relative group">
            <div className="absolute -top-3 left-4 bg-[var(--bg-page)] px-2 font-mono text-xs font-bold border-2 border-[var(--border-color)] z-20 text-[var(--text-secondary)]">
              {t('commandInput')}
            </div>

            {/* Shadow Layer */}
            <div className="absolute inset-0 bg-[var(--shadow-color)] translate-x-2 translate-y-2 group-focus-within:translate-x-3 group-focus-within:translate-y-3 group-focus-within:bg-[var(--accent-hover)] transition-all" />

            {/* Input Container */}
            <div className="relative border-2 border-[var(--border-color)] bg-[var(--bg-card)] flex flex-col">
              {/* Textarea with Line Numbers */}
              <div className="flex-1 relative flex">
                {/* Line Numbers */}
                <div className="flex-none w-12 py-6 pl-4 border-r-2 border-[var(--border-color)]">
                  <div className="font-mono text-sm text-[var(--text-secondary)] opacity-30 select-none leading-relaxed">
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
                  className="flex-1 w-full h-[135px] bg-transparent py-6 text-[20px] leading-[28px] font-bold font-mono text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none focus:ring-0 border-none resize-none z-10 relative"
                  style={{ paddingLeft: '24px', paddingRight: '24px', paddingTop: '24px', paddingBottom: '24px' }}
                />
              </div>

              {/* Toolbar */}
              <div className="flex justify-between items-center p-2 sm:p-3 border-t-2 border-[var(--border-color)] bg-[var(--bg-page)] gap-2">
                <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                  {/* 附件按钮 */}
                  <div className="flex gap-1 flex-shrink-0">
                    <button className="p-1.5 sm:p-2 border-2 border-transparent hover:bg-[var(--bg-card)] hover:border-[var(--border-color)] transition-all">
                      <Image className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.5]" />
                    </button>
                    <button className="p-1.5 sm:p-2 border-2 border-transparent hover:bg-[var(--bg-card)] hover:border-[var(--border-color)] transition-all">
                      <Paperclip className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.5]" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
                  <span className="font-mono text-[10px] text-[var(--text-secondary)] hidden sm:inline">ENTER TO SEND</span>
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
              <div className="flex justify-between items-end mb-6 border-b-2 border-[var(--border-color)] pb-2 w-full">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 bg-[var(--accent-hover)] border border-[var(--border-color)]" />
                  <h3 className="text-sm font-black uppercase tracking-widest">{t('recommended')}</h3>
                </div>
                <div className="font-mono text-[10px] text-[var(--text-secondary)]">SHOWING 3 OF 12</div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {scenes.map((scene) => (
                  <SceneCard key={scene.number} {...scene} />
                ))}
              </div>
            </div>

            {/* My Constructs Section */}
            <div className="pt-8">
              <div className="flex justify-between items-end mb-6 border-b-2 border-[var(--border-color)] pb-2 w-full">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 bg-[var(--logo-base)] border border-[var(--border-color)]" />
                  <h3 className="text-sm font-black uppercase tracking-widest">{t('myConstructs')}</h3>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Create New Card */}
                <CreateNewCard onClick={handleCreateAgent} />

                {/* 👈 默认助手已移除：用户通过底部输入框与默认助手交互，避免重复创建 thread */}

                {/* Custom Agents */}
                {customAgents.slice(0, 2).map((agent) => (
                  <ConstructCard
                    key={agent.id}
                    name={agent.name}
                    type={agent.category?.toUpperCase() || 'CUSTOM'}
                    status="offline"
                    tags={[agent.category?.substring(0, 6).toUpperCase() || 'AGENT']}
                    sideColor="#888888"
                    onClick={() => handleAgentClick(agent.id)}
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
