import { useState } from 'react'
import { Bot } from 'lucide-react'
import { useTranslation } from '@/i18n'
import { useChatStore } from '@/store/chatStore'
import { agents as defaultAgents } from '@/data/agents'
import AgentCard from '@/components/AgentCard'
import { useNavigate } from 'react-router-dom'
import PixelLetters from './PixelLetters'
import GlowingInput from './GlowingInput'

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
    navigate(`/chat/new?agentId=${agentId}`)
  }

  const handleCreateAgent = () => {
    navigate('/create-agent')
  }

  const handleSendMessage = () => {
    if (!inputMessage.trim()) return
    
    // 导航到新建对话，并通过 state 传递初始消息
    navigate('/chat/new', { 
      state: { 
        startWith: inputMessage 
      } 
    })
  }

  return (
    <div className="max-w-7xl mx-auto px-4 pb-12 pt-20 md:pt-28">
      {/* Hero Section */}
      <div className="flex flex-col items-center justify-center mb-16 md:mb-20 space-y-12 md:space-y-16">
        <div className="transform scale-100 transition-transform duration-500 py-2">
          <PixelLetters />
        </div>
        
        <div className="w-full max-w-5xl px-0 md:px-4 lg:px-8">
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
      <div className="text-left mb-6 animate-fade-in-up px-2">
        <h2 className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 tracking-tight">
          All Agents, One Pouch
        </h2>
        
        {/* Agent Tabs */}
        <div className="flex space-x-6 mt-6 border-b border-gray-200 dark:border-gray-700">
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-700 fill-mode-forwards">
        {displayedAgents.length > 0 ? (
          displayedAgents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              isSelected={selectedAgentId === agent.id}
              onClick={() => handleAgentClick(agent.id)}
            />
          ))
        ) : (
          <div className="col-span-full py-12 text-center text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
            <Bot className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p>No agents created yet.</p>
            <button 
              onClick={handleCreateAgent}
              className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-md text-sm hover:bg-indigo-700 transition-colors"
            >
              Create your first agent
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
