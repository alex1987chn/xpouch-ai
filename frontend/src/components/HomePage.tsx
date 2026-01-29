import { useState, useEffect, useMemo, useCallback } from 'react'
import { Bot, Plus, Code2, FileText, Zap, Menu, Paperclip, ArrowRight, Image } from 'lucide-react'
import { useTranslation } from '@/i18n'
import { useChatStore } from '@/store/chatStore'
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog'
import { useNavigate, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { deleteCustomAgent, getAllAgents } from '@/services/api'
import type { Agent } from '@/types'
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

type ConversationMode = 'simple' | 'complex'

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
}: {
  name: string
  type: string
  status: 'online' | 'offline'
  tags: string[]
  sideColor: string
  onClick?: () => void
}) {
  const isOnline = status === 'online'

  return (
    <Card
      onClick={onClick}
      className="p-0 cursor-pointer group h-44 flex relative overflow-hidden"
    >
      {/* 左侧色条 */}
      <div
        className="w-4 h-full border-r-2 border-[var(--border-color)] z-10 flex flex-col items-center justify-center gap-1 py-2 transition-colors"
        style={{ backgroundColor: sideColor }}
      >
        {isOnline && (
          <>
            <div className="w-1 h-1 bg-[var(--bg-card)] rounded-full" />
            <div className="w-1 h-1 bg-[var(--bg-card)] rounded-full" />
            <div className="w-1 h-1 bg-[var(--bg-card)] rounded-full" />
          </>
        )}
      </div>

      <div className="p-5 flex-1 flex flex-col justify-between z-10">
        <div className="flex justify-between items-start">
          <h4 className={cn("font-black text-xl tracking-tight", !isOnline && "text-[var(--text-secondary)]")}>
            {name}
          </h4>
          <div className="flex items-center gap-1 border border-[var(--border-color)] px-1 bg-[var(--bg-page)]">
            <div className={cn("w-1.5 h-1.5 rounded-full", isOnline ? "bg-green-500 animate-pulse" : "bg-gray-400")} />
            <span className={cn("font-mono text-[9px] font-bold", !isOnline && "text-[var(--text-secondary)]")}>
              {isOnline ? 'ON' : 'OFF'}
            </span>
          </div>
        </div>
        <div>
          <p className="font-mono text-xs text-[var(--text-secondary)] mb-3">/// {type}</p>
          <div className="flex gap-1 flex-wrap">
            {tags.map((tag) => (
              <span
                key={tag}
                className={cn(
                  "px-2 py-0.5 text-[9px] font-bold border border-[var(--border-color)] bg-[var(--bg-page)]",
                  !isOnline && "text-[var(--text-secondary)]"
                )}
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
  return (
    <div
      onClick={onClick}
      className="border-2 border-dashed border-[var(--text-secondary)] p-6 cursor-pointer group flex flex-col items-center justify-center h-44 bg-transparent hover:bg-[var(--bg-card)] hover:border-solid hover:border-[var(--accent-hover)] hover:shadow-[8px_8px_0_0_var(--accent-hover)] transition-all relative"
    >
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-10 text-[var(--border-color)] font-black text-6xl select-none">
        +
      </div>
      <div className="w-12 h-12 border-2 border-[var(--text-primary)] flex items-center justify-center mb-4 text-3xl group-hover:bg-[var(--accent-hover)] group-hover:border-[var(--accent-hover)] group-hover:text-black transition-colors bg-[var(--bg-page)]">
        +
      </div>
      <span className="font-bold font-mono uppercase tracking-wider text-sm group-hover:text-[var(--text-primary)]">
        Initialize New
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

  // 对话模式：简单对话（默认）或 复杂任务
  const [conversationMode, setConversationMode] = useState<ConversationMode>('simple')

  // 删除确认对话框状态
  const [deletingAgentId, setDeletingAgentId] = useState<string | null>(null)
  const [deletingAgentName, setDeletingAgentName] = useState<string>('')

  // 从后端加载自定义智能体列表
  useEffect(() => {
    const loadCustomAgents = async () => {
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
        setCustomAgents(customAgentsData)
      } catch (error) {
        logger.error('加载自定义智能体失败:', error)
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
  const displayedAgents = useMemo<Agent[]>(() => {
    const defaultAgent: Agent = {
      id: SYSTEM_AGENTS.DEFAULT_CHAT,
      name: getSystemAgentName(SYSTEM_AGENTS.DEFAULT_CHAT),
      description: '日常对话、通用任务、智能问答',
      icon: <Bot className="w-5 h-5" />,
      modelId: 'deepseek-chat',
      isDefault: true
    }

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

    return [createAgentCard, defaultAgent, ...customAgentsWithIcon]
  }, [customAgents])

  // 点击智能体卡片
  const handleAgentClick = useCallback((agentId: string) => {
    setSelectedAgentId(agentId)
    const newId = crypto.randomUUID()
    useChatStore.getState().setCurrentConversationId(newId)
    navigate(`/chat/${newId}?agentId=${agentId}`)
  }, [setSelectedAgentId, navigate])

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

    const agentIdForChat = conversationMode === 'simple'
      ? selectedAgentId || SYSTEM_AGENTS.DEFAULT_CHAT
      : SYSTEM_AGENTS.ORCHESTRATOR

    // 根据模式选择不同的聊天页面
    if (conversationMode === 'complex') {
      // 复杂模式：使用 UnifiedChatPage，路径包含ID
      const searchParams = new URLSearchParams()
      searchParams.set('agentId', agentIdForChat)
      searchParams.set('new', 'true')
      navigate(`/chat/${newId}?${searchParams.toString()}`, {
        state: { startWith: inputMessage, conversationMode }
      })
    } else {
      // 简单模式：使用 UnifiedChatPage，使用query参数
      const searchParams = new URLSearchParams()
      searchParams.set('conversation', newId)
      searchParams.set('agentId', agentIdForChat)
      searchParams.set('new', 'true')
      navigate(`/chat?${searchParams.toString()}`, {
        state: { startWith: inputMessage, conversationMode }
      })
    }
  }, [inputMessage, navigate, conversationMode, selectedAgentId])

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
        setConversationMode('complex')
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
        setConversationMode('complex')
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
        setConversationMode('simple')
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
            <div className="flex gap-2 mb-6">
              <span className="px-2 py-1 text-[10px] font-mono font-bold border border-[var(--border-color)] bg-[var(--accent-hover)] text-black shadow-[2px_2px_0_0_var(--shadow-color)]">
                READY
              </span>
              <span className="px-2 py-1 text-[10px] font-mono font-bold border border-[var(--border-color)] text-[var(--text-secondary)]">
                IDLE
              </span>
            </div>

            <h2 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-black tracking-tighter uppercase mb-2 leading-[0.9]">
              READY TO <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--text-primary)] to-[var(--text-secondary)]">
                ASSEMBLE?
              </span>
            </h2>
          </div>

          {/* Command Input */}
          <div className="flex-none mb-16 relative group">
            <div className="absolute -top-3 left-4 bg-[var(--bg-page)] px-2 font-mono text-xs font-bold border-2 border-[var(--border-color)] z-20 text-[var(--text-secondary)]">
              COMMAND_INPUT
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
                  placeholder="// Initialize construct..."
                  className="flex-1 w-full h-[135px] bg-transparent py-6 text-[20px] leading-[28px] font-bold font-mono text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none focus:ring-0 border-none resize-none z-10 relative"
                  style={{ paddingLeft: '24px', paddingRight: '24px', paddingTop: '24px', paddingBottom: '24px' }}
                />
              </div>

              {/* Toolbar */}
              <div className="flex justify-between items-center p-2 sm:p-3 border-t-2 border-[var(--border-color)] bg-[var(--bg-page)] gap-2">
                <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                  {/* 模式切换 - Bauhaus 风格 */}
                  <div className="flex items-center border-2 border-black bg-white flex-shrink-0">
                    <button
                      onClick={() => setConversationMode('simple')}
                      className={cn(
                        'px-2 sm:px-3 py-1.5 font-mono text-[9px] sm:text-[10px] font-bold uppercase transition-all border-r-2 border-black',
                        conversationMode === 'simple'
                          ? 'bg-[var(--accent)] text-black'
                          : 'bg-transparent text-gray-500 hover:text-black hover:bg-gray-100'
                      )}
                    >
                      SIMPLE
                    </button>
                    <button
                      onClick={() => setConversationMode('complex')}
                      className={cn(
                        'px-2 sm:px-3 py-1.5 font-mono text-[9px] sm:text-[10px] font-bold uppercase transition-all',
                        conversationMode === 'complex'
                          ? 'bg-black text-white'
                          : 'bg-transparent text-gray-500 hover:text-black hover:bg-gray-100'
                      )}
                    >
                      COMPLEX
                    </button>
                  </div>

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
                    <span className="hidden sm:inline">EXECUTE</span>
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
                  <h3 className="text-sm font-black uppercase tracking-widest">Recommended</h3>
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
                  <h3 className="text-sm font-black uppercase tracking-widest">My Constructs</h3>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Create New Card */}
                <CreateNewCard onClick={handleCreateAgent} />

                {/* Default Agent */}
                <ConstructCard
                  name="Nexus_Core"
                  type="PERSONAL.ASST"
                  status="online"
                  tags={['CHAT', 'MEMORY']}
                  sideColor="var(--logo-base)"
                  onClick={() => handleAgentClick(SYSTEM_AGENTS.DEFAULT_CHAT)}
                />

                {/* Custom Agents */}
                {customAgents.slice(0, 1).map((agent) => (
                  <ConstructCard
                    key={agent.id}
                    name={agent.name}
                    type={agent.category?.toUpperCase() || 'CUSTOM'}
                    status="offline"
                    tags={[agent.category?.substring(0, 6).toUpperCase() || 'AGENT']}
                    sideColor="#888888"
                    onClick={() => handleAgentClick(agent.id)}
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
        title="确认删除智能体"
        description="删除后无法恢复，请确认是否继续？"
        itemName={deletingAgentName}
      />
    </div>
  )
}
