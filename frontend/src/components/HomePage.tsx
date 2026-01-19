import { useState, useEffect, useMemo, useCallback } from 'react'
import { Bot } from 'lucide-react'
import { useTranslation } from '@/i18n'
import { useChatStore } from '@/store/chatStore'
import { experts as defaultExperts, type Agent } from '@/data/agents'
import AgentCard from '@/components/AgentCard'
import { useNavigate } from 'react-router-dom'
import PixelLetters from './PixelLetters'
import GlowingInput from './GlowingInput'
import { generateId } from '@/utils/storage'
import { cn } from '@/lib/utils'

export default function HomePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [showSlogan, setShowSlogan] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setShowSlogan(true), 4000)
    return () => clearTimeout(timer)
  }, [])

  const {
    selectedAgentId,
    setSelectedAgentId,
    customAgents
  } = useChatStore()

  const [inputMessage, setInputMessage] = useState('')

  // Agent Tab 状态
  const [agentTab, setAgentTab] = useState<'featured' | 'my'>('featured')

  // 使用 useMemo 优化智能体列表计算
  const displayMyAgents = useMemo<Agent[]>(
    () => customAgents.map(a => ({
      ...a,
      icon: <Bot className="w-5 h-5" />
    })),
    [customAgents]
  )

  const displayedAgents = useMemo<Agent[]>(
    () => agentTab === 'featured' ? defaultExperts : displayMyAgents,
    [agentTab, defaultExperts, displayMyAgents]
  )

  // 默认选中第一个卡片
  useEffect(() => {
    if (!selectedAgentId && displayedAgents.length > 0) {
      setSelectedAgentId(displayedAgents[0].id)
    }
  }, [displayedAgents, selectedAgentId, setSelectedAgentId])

  // 使用 useCallback 优化事件处理函数
  const handleAgentClick = useCallback((agentId: string) => {
    setSelectedAgentId(agentId)
    const newId = generateId()
    navigate(`/chat/${newId}?agentId=${agentId}`)
  }, [setSelectedAgentId, navigate])

  const handleCreateAgent = useCallback(() => {
    navigate('/create-agent')
  }, [navigate])

  const handleSendMessage = useCallback(() => {
    if (!inputMessage.trim()) return

    // 如果用户选择了专家（如编程专家），传递 agentId
    const newId = generateId()
    console.log('[HomePage] Sending message with temp ID:', newId, 'message:', inputMessage, 'agentId:', selectedAgentId)

    navigate(`/chat/${newId}`, {
      state: {
        startWith: inputMessage,
        agentId: selectedAgentId || undefined
      }
    })
  }, [inputMessage, navigate, selectedAgentId])

  return (
    <div className="bg-transparent homepage-scroll overflow-y-auto overflow-x-hidden scrollbar-gutter-stable h-[100dvh] scroll-smooth">
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

          <div className="w-full max-w-3xl mx-auto mt-14">
            <div className="transform transition-all duration-300 hover:scale-[1.01]">
              <GlowingInput
                value={inputMessage}
                onChange={setInputMessage}
                onSubmit={handleSendMessage}
                placeholder={t('placeholder')}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 智能体列表分类 Tab */}
      <div className="px-6 md:px-12">
        <div className="w-full max-w-5xl mx-auto">
          <header className="mb-6 mt-12">
            <div className="flex space-x-6">
              <button
                onClick={() => setAgentTab('featured')}
                className={`text-sm font-semibold border-b-2 pb-1 transition-all ${
                  agentTab === 'featured'
                    ? 'border-violet-500 text-violet-600 dark:text-violet-400'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                {t('featuredAgents')}
              </button>
              <button
                onClick={() => setAgentTab('my')}
                className={`text-sm font-medium border-b-2 pb-1 transition-all ${
                  agentTab === 'my'
                    ? 'border-violet-500 text-violet-600 dark:text-violet-400'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                {t('myAgents')}
              </button>
            </div>
          </header>
        </div>
      </div>

      {/* Agent Grid Container - 自然布局，全页滚动 */}
      <div className="w-full max-w-5xl mx-auto px-6 md:px-12 pb-24 md:pb-20 mt-12">
        {/* PC 端：4列网格；移动端：2列网格 */}
        <div className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-700 fill-mode-forwards">
          {displayedAgents.map((agent, index) => (
            <AgentCard
              key={`${agent.id}-${index}`}
              agent={agent}
              index={index}
              isSelected={selectedAgentId === agent.id}
              onClick={() => handleAgentClick(agent.id)}
            />
          ))}
        </div>

        {/* 空状态卡片 - 只在 myAgents 标签页且没有智能体时显示 */}
        {agentTab === 'my' && displayMyAgents.length === 0 && (
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
    </div>
  )
}
