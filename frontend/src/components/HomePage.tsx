import { useState, useEffect, useMemo, useCallback } from 'react'
import { Bot, Sparkles, Code2, FileText, Zap } from 'lucide-react'
import { useTranslation } from '@/i18n'
import { useChatStore } from '@/store/chatStore'
import AgentCard from '@/components/AgentCard'
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog'
import { useNavigate, useLocation } from 'react-router-dom'
import PixelLetters from './PixelLetters'
import GlowingInput from './GlowingInput'
import { generateId } from '@/utils/storage'
import { cn } from '@/lib/utils'
import { deleteCustomAgent, getAllAgents } from '@/services/api'
import type { Agent } from '@/types'
import { SYSTEM_AGENTS, getSystemAgentName } from '@/constants/agents'

type ConversationMode = 'simple' | 'complex'

export default function HomePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const [showSlogan, setShowSlogan] = useState(false)

  const {
    selectedAgentId,
    setSelectedAgentId,
    customAgents,
    setCustomAgents
  } = useChatStore()

  useEffect(() => {
    const timer = setTimeout(() => setShowSlogan(true), 4000)
    return () => clearTimeout(timer)
  }, [])

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
        // 后端已经按 created_at 降序排序了（最新的在前）
        // 直接使用返回的自定义智能体列表，完全替换 store 中的数据
        const customAgentsData = response.map(agent => ({
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
        // 使用完全替换而不是合并，确保与后端同步
        setCustomAgents(customAgentsData)
      } catch (error) {
        console.error('加载自定义智能体失败:', error)
      }
    }

    loadCustomAgents()
  }, [refreshKey, setCustomAgents]) // 添加 setCustomAgents 依赖

  // 监听路由变化，当从创建页面返回首页时重置状态
  useEffect(() => {
    if (location.pathname === '/') {
      setRefreshKey(prev => prev + 1)
      // 重置为默认助手
      setSelectedAgentId(SYSTEM_AGENTS.DEFAULT_CHAT)
    }
  }, [location.pathname, setSelectedAgentId])

  // 构建显示的智能体列表：默认助手 + 自定义智能体
  const displayedAgents = useMemo<Agent[]>(() => {
    // 默认助手（第一位）
    const defaultAgent: Agent = {
      id: SYSTEM_AGENTS.DEFAULT_CHAT,
      name: getSystemAgentName(SYSTEM_AGENTS.DEFAULT_CHAT),
      description: '日常对话、通用任务、智能问答',
      icon: <Bot className="w-5 h-5" />,
      modelId: 'deepseek-chat',
      isDefault: true
    }

    // 自定义智能体
    const customAgentsWithIcon = customAgents.map(a => ({
      ...a,
      icon: <Bot className="w-5 h-5" />
    }))

    return [defaultAgent, ...customAgentsWithIcon]
  }, [customAgents])

  // 默认选中第一个卡片（默认助手）
  useEffect(() => {
    if (!selectedAgentId && displayedAgents.length > 0) {
      setSelectedAgentId(displayedAgents[0].id)
    }
  }, [displayedAgents, selectedAgentId, setSelectedAgentId])

  // 点击智能体卡片
  const handleAgentClick = useCallback((agentId: string) => {
    setSelectedAgentId(agentId)
    const newId = generateId()
    navigate(`/chat/${newId}?agentId=${agentId}`)
  }, [setSelectedAgentId, navigate])

  const handleCreateAgent = useCallback(() => {
    navigate('/create-agent')
  }, [navigate])

  // 处理删除自定义 agent - 打开确认对话框
  const handleDeleteAgent = useCallback((agentId: string, agentName: string) => {
    setDeletingAgentId(agentId)
    setDeletingAgentName(agentName)
  }, [])

  // 调试对话模式变化
  useEffect(() => {
    console.log('[HomePage] conversationMode changed to:', conversationMode)
  }, [conversationMode])

  // 确认删除操作
  const handleConfirmDelete = useCallback(async () => {
    if (!deletingAgentId) return

    try {
      await deleteCustomAgent(deletingAgentId)
      setCustomAgents(prev => prev.filter(agent => agent.id !== deletingAgentId))
      // 如果删除的是当前选中的 agent，切换到默认助手
      if (selectedAgentId === deletingAgentId) {
        setSelectedAgentId(SYSTEM_AGENTS.DEFAULT_CHAT)
      }
    } catch (error) {
      console.error('删除自定义智能体失败:', error)
      // 即使删除失败（比如 404），也从 store 中移除该 agent
      setCustomAgents(prev => prev.filter(agent => agent.id !== deletingAgentId))
      // 如果删除的是当前选中的 agent，切换到默认助手
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

    const newId = generateId()

    // 根据对话模式决定使用哪个智能体
    // 简单模式：使用当前选中的智能体（默认助手或自定义智能体）
    // 复杂模式：使用任务指挥官（sys-task-orchestrator）
    const agentIdForChat = conversationMode === 'simple'
      ? selectedAgentId || SYSTEM_AGENTS.DEFAULT_CHAT
      : SYSTEM_AGENTS.ORCHESTRATOR

    navigate(`/chat/${newId}?agentId=${agentIdForChat}`, {
      state: {
        startWith: inputMessage
      }
    })
  }, [inputMessage, navigate, conversationMode, selectedAgentId])

  return (
    <div className="bg-transparent homepage-scroll overflow-y-auto overflow-x-hidden scrollbar-gutter-stable w-full h-full scroll-smooth">
      {/* Logo + 输入框区域 */}
      <div className="pt-[10vh] pb-6 px-6 md:px-12">
        <div className="w-full max-w-5xl mx-auto">
          <div className="flex flex-col items-center">
            <div className="relative w-full h-28 overflow-hidden flex items-center justify-center">
              <PixelLetters />
            </div>
            <p className={`mt-1 text-xs sm:text-sm md:text-base font-semibold uppercase tracking-[0.25em] text-slate-700 dark:text-slate-300 ${
              showSlogan ? 'animate-fadeIn' : 'opacity-0'
            }`}>
              All Agents, One <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-violet-500 font-bold">POUCH</span>
            </p>
          </div>

          <div className="w-full max-w-4xl mx-auto mt-14">
            <div className="transform transition-all duration-300 hover:scale-[1.01]">
              {/* 输入框 */}
              <GlowingInput
                value={inputMessage}
                onChange={setInputMessage}
                onSubmit={handleSendMessage}
                placeholder={conversationMode === 'simple' ? t('placeholder') : t('submitTaskPlaceholder')}
                conversationMode={conversationMode}
                onConversationModeChange={setConversationMode}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 推荐场景区域（占位符，未来扩展） */}
      <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 md:px-12 mt-8 sm:mt-12">
        <header className="mb-4 sm:mb-6">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">推荐场景</h2>
        </header>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {/* 场景1：代码生成 */}
          <div
            onClick={() => {
              setInputMessage('帮我编写一个React组件')
              setConversationMode('complex')
            }}
            className="cursor-pointer overflow-hidden bg-white dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-xl hover:border-violet-300 dark:hover:border-violet-500"
          >
            <div className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-gradient-to-br from-violet-100 to-purple-50 dark:from-violet-900/30 dark:to-purple-900/20">
                  <Code2 className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                </div>
                <h3 className="font-bold text-slate-800 dark:text-slate-100">代码生成</h3>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                AI助手会自动拆解任务，调用编程专家为您生成代码
              </p>
            </div>
          </div>

          {/* 场景2：深度调研 */}
          <div
            onClick={() => {
              setInputMessage('帮我调研一下最新的前端技术趋势')
              setConversationMode('complex')
            }}
            className="cursor-pointer overflow-hidden bg-white dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-xl hover:border-violet-300 dark:hover:border-violet-500"
          >
            <div className="p-4 sm:p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-gradient-to-br from-blue-100 to-cyan-50 dark:from-blue-900/30 dark:to-cyan-900/20">
                  <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="font-bold text-slate-800 dark:text-slate-100">深度调研</h3>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                AI助手会调用搜索专家和研究专家，为您完成深度调研
              </p>
            </div>
          </div>

          {/* 场景3：快速问答 */}
          <div
            onClick={() => {
              setInputMessage('今天天气怎么样？')
              setConversationMode('simple')
            }}
            className="cursor-pointer overflow-hidden bg-white dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-xl hover:border-violet-300 dark:hover:border-violet-500"
          >
            <div className="p-4 sm:p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-gradient-to-br from-amber-100 to-orange-50 dark:from-amber-900/30 dark:to-orange-900/20">
                  <Zap className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
                <h3 className="font-bold text-slate-800 dark:text-slate-100">快速问答</h3>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                使用默认助手快速回答您的问题，适合简单对话
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 我的智能体区域 */}
      <div className="w-full max-w-5xl mx-auto px-6 md:px-12 mt-12 pb-24 md:pb-20">
        <header className="mb-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">我的智能体</h2>
            <button
              onClick={handleCreateAgent}
              className="text-xs font-medium text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 transition-colors"
            >
              + 新建智能体
            </button>
          </div>
        </header>

        {/* PC 端：4列网格；移动端：2列网格 */}
        <div className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-700 fill-mode-forwards">
          {displayedAgents.map((agent, index) => (
            <AgentCard
              key={`${agent.id}-${index}`}
              agent={agent}
              index={index}
              isSelected={selectedAgentId === agent.id}
              onClick={() => handleAgentClick(agent.id)}
              showDeleteButton={!agent.isDefault}
              onDelete={() => handleDeleteAgent(agent.id, agent.name)}
            />
          ))}
        </div>

        {/* 空状态卡片 - 只在没有自定义智能体时显示 */}
        {customAgents.length === 0 && (
          <div
            onClick={handleCreateAgent}
            className={cn(
              'group relative cursor-pointer overflow-hidden',
              'bg-white dark:bg-slate-900/50',
              'rounded-2xl border border-dashed border-slate-200/50 dark:border-slate-700/50',
              'shadow-[0_8px_30px_rgb(0,0,0,0.04)]',
              'transition-all duration-300 ease-out',
              'hover:-translate-y-1 hover:shadow-xl',
              'hover:border-violet-300 dark:hover:border-violet-500'
            )}
          >
            {/* 左侧渐变竖条 - Hover 时显示 */}
            <div className="absolute left-0 top-0 bottom-0 w-[4px] bg-gradient-to-b from-blue-400 to-violet-500 opacity-0 group-hover:opacity-100 transition-all duration-300" />

            <div className="p-5 pl-5">
              <div className="flex items-center gap-3">
                {/* 图标容器 */}
                <div className={cn(
                  'w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0',
                  'bg-gradient-to-br from-slate-100 to-slate-50 dark:from-slate-800 dark:to-slate-700',
                  'transition-all duration-300 ease-out',
                  'group-hover:bg-gradient-to-br group-hover:from-violet-500 group-hover:to-fuchsia-500',
                  'group-hover:scale-110'
                )}>
                  <Bot className="w-5 h-5 text-slate-400 dark:text-slate-500 group-hover:text-white transition-colors" />
                </div>

                {/* 标题与描述 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h3 className="font-bold text-slate-800 dark:text-slate-100 truncate text-sm leading-tight">
                      {t('addCustomAgent')}
                    </h3>
                    <span className="flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                      新建
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    + {t('createYourFirstAgent')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 删除确认对话框 */}
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


