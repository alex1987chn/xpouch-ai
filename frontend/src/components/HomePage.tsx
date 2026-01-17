import { useState } from 'react'
import { Bot } from 'lucide-react'
import { useTranslation } from '@/i18n'
import { useChatStore } from '@/store/chatStore'
import { agents as defaultAgents } from '@/data/agents'
import AgentCard from '@/components/AgentCard'
import { useNavigate } from 'react-router-dom'
import PixelLetters from './PixelLetters'
import GlowingInput from './GlowingInput'
import { generateId } from '@/utils/storage'

export default function HomePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  
  const { 
    selectedAgentId, 
    setSelectedAgentId,
    customAgents
  } = useChatStore()

  const [inputMessage, setInputMessage] = useState('')

  // Agent Tab 状态
  const [agentTab, setAgentTab] = useState<'featured' | 'my'>('featured')

  // 合并智能体列表用于显示
  const displayMyAgents = customAgents.map(a => ({
    ...a,
    icon: <Bot className="w-5 h-5" />
  }))

  const displayedAgents = agentTab === 'featured' ? defaultAgents : displayMyAgents

  const handleAgentClick = (agentId: string) => {
    setSelectedAgentId(agentId)
    const newId = generateId()
    navigate(`/chat/${newId}?agentId=${agentId}`)
  }

  const handleCreateAgent = () => {
    navigate('/create-agent')
  }

  const handleSendMessage = () => {
    if (!inputMessage.trim()) return

    // 生成新的会话 ID 并导航到 Canvas 模式
    const newId = generateId()
    console.log('[HomePage] Sending message with temp ID:', newId, 'message:', inputMessage)
    navigate(`/chat/${newId}`, {
      state: {
        startWith: inputMessage
      }
    })
  }

  return (
    <div className="w-full max-w-7xl mx-auto px-4 pb-12 pt-20 md:pt-28 flex flex-col">
      {/* Hero Section */}
      <div className="w-full flex flex-col mb-16 md:mb-20 space-y-12 md:space-y-16">
        {/* Logo - 居中对齐 */}
        <div className="w-full flex justify-center">
          <div className="transform scale-100 transition-transform duration-500 py-2">
            <PixelLetters />
          </div>
        </div>

        {/* 输入框容器 */}
        <div className="w-full max-w-5xl mx-auto">
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

      {/* Slogan */}
      <div className="w-full text-left mb-6 animate-fade-in-up">
        <h2 className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 tracking-tight">
          All Agents, One Pouch
        </h2>

        {/* Agent Tabs */}
        <div className="w-full flex space-x-6 mt-6 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setAgentTab('featured')}
            className={`pb-2 text-sm font-medium transition-colors relative ${
              agentTab === 'featured'
                ? 'text-indigo-600 dark:text-indigo-400'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            {t('featuredAgents')}
            {agentTab === 'featured' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 dark:bg-indigo-400" />
            )}
          </button>
          <button
            onClick={() => setAgentTab('my')}
            className={`pb-2 text-sm font-medium transition-colors relative ${
              agentTab === 'my'
                ? 'text-indigo-600 dark:text-indigo-400'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            {t('myAgents')}
            {agentTab === 'my' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 dark:bg-indigo-400" />
            )}
          </button>
        </div>
      </div>

      {/* Agent Grid Container */}
      <div className="w-full">
        <div className="w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-700 fill-mode-forwards">
          {displayedAgents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              isSelected={selectedAgentId === agent.id}
              onClick={() => handleAgentClick(agent.id)}
            />
          ))}
          {/* 空状态卡片 - 只在 myAgents 标签页且没有智能体时显示 */}
          {agentTab === 'my' && displayMyAgents.length === 0 && (
            <div className="w-full">
              <div
                onClick={handleCreateAgent}
                className="group cursor-pointer transition-all duration-300 border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-purple-300 dark:hover:border-purple-400 hover:border-solid bg-white/40 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center min-h-[180px] hover:shadow-xl hover:-translate-y-1"
              >
                <Bot className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3 transition-colors group-hover:text-purple-400 dark:group-hover:text-purple-300" />
                <p className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-2 group-hover:text-purple-600 dark:group-hover:text-purple-300 transition-colors">
                  {t('addCustomAgent')}
                </p>
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  + {t('createYourFirstAgent')}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
