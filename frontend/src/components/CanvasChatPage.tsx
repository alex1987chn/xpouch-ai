import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, X } from 'lucide-react'
import { useChatStore } from '@/store/chatStore'
import { useChat } from '@/hooks/useChat'
import { useCanvasStore } from '@/store/canvasStore'
import { getConversation, type ApiMessage } from '@/services/api'
import { type Message, type Conversation } from '@/types'
import { generateId } from '@/utils/storage'
import FloatingChatPanel from './FloatingChatPanel'
import ExpertDrawer from './ExpertDrawer'
import XPouchLayout from './XPouchLayout'
import { useUserStore } from '@/store/userStore'
import { useApp } from '@/providers/AppProvider'
import ExpertStatusBar from './ExpertStatusBar'
import ArtifactsArea from './ArtifactsArea'
import { ArtifactProvider } from '@/providers/ArtifactProvider'
import { SYSTEM_AGENTS } from '@/constants/agents'

export default function CanvasChatPage() {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()

  // 存储当前会话对象（用于数据驱动 UI）
  const [currentConvData, setCurrentConvData] = useState<Conversation | null>(null)

  // 从 URL 搜索参数获取 agentId
  const agentIdFromUrl = new URLSearchParams(location.search).get('agentId')

  // 根据 URL 中的 agentId 确定对话模式
  const initialConversationMode = useMemo(() => {
    console.log('[CanvasChatPage] initialConversationMode: agentIdFromUrl =', agentIdFromUrl)
    return agentIdFromUrl === SYSTEM_AGENTS.ORCHESTRATOR ? 'complex' : 'simple'
  }, [agentIdFromUrl])

  // 对话模式状态：根据 URL 参数初始化
  const [conversationMode, setConversationMode] = useState<'simple' | 'complex'>(initialConversationMode)

  const { fetchUser } = useUserStore()

  // 确保用户信息已加载
  useEffect(() => {
    fetchUser()
  }, [fetchUser])

  const handledStartWithRef = useRef(false)
  const hasLoadedConversationRef = useRef(false)
  const [isExpertDrawerOpen, setIsExpertDrawerOpen] = useState(false)
  const [isChatMinimized, setIsChatMinimized] = useState(false)
  const [isArtifactFullscreen, setIsArtifactFullscreen] = useState(false)

  const {
    messages,
    isTyping,
    inputMessage,
    setInputMessage,
    handleSendMessage,
    handleStopGeneration
  } = useChat()

  const {
    setSelectedAgentId,
    setMessages,
    setCurrentConversationId,
    getCurrentAgent
  } = useChatStore()

  const { selectedExpert } = useCanvasStore()
  const { sidebar } = useApp()

  // 处理对话模式切换
  const handleConversationModeChange = useCallback((newMode: 'simple' | 'complex') => {
    console.log('[CanvasChatPage] 切换对话模式:', newMode)
    setConversationMode(newMode)

    // 切换模式时，更新 selectedAgentId
    const currentPath = location.pathname
    const searchParams = new URLSearchParams(location.search)

    if (newMode === 'complex') {
      // 切换到复杂模式：使用任务指挥官
      setSelectedAgentId(SYSTEM_AGENTS.ORCHESTRATOR)
      searchParams.set('agentId', SYSTEM_AGENTS.ORCHESTRATOR)
    } else {
      // 切换到简单模式：使用默认助手
      setSelectedAgentId(SYSTEM_AGENTS.DEFAULT_CHAT)
      searchParams.set('agentId', SYSTEM_AGENTS.DEFAULT_CHAT)
    }

    // 更新 URL（保持 conversationId，更新 agentId）
    navigate(`${currentPath}?${searchParams.toString()}`, { replace: true })
  }, [setSelectedAgentId, location, navigate])

  // 监听 agentId 变化，自动更新模式
  useEffect(() => {
    console.log('[CanvasChatPage] agentIdFromUrl 变化:', agentIdFromUrl)
    if (agentIdFromUrl === SYSTEM_AGENTS.ORCHESTRATOR) {
      setConversationMode('complex')
    } else {
      // 其他都是简单模式（默认助手、自定义智能体）
      setConversationMode('simple')
    }
  }, [agentIdFromUrl])

  // 处理 URL 参数中的 agentId
  useEffect(() => {
    if (agentIdFromUrl) {
      setSelectedAgentId(agentIdFromUrl)
    }
  }, [agentIdFromUrl, setSelectedAgentId])

  // 处理 startWith 消息（自动发送）
  useEffect(() => {
    const state = location.state as { startWith?: string; agentId?: string } | null

    if (state?.startWith && !handledStartWithRef.current) {
      handledStartWithRef.current = true
      handleSendMessage(state.startWith)
      navigate(location.pathname + location.search, { replace: true, state: {} })
    }
  }, [location, handleSendMessage, navigate, setSelectedAgentId, agentIdFromUrl])

  // 初始化或加载会话
  useEffect(() => {
    if (!id) {
      setCurrentConversationId(null)
      setMessages([])
      hasLoadedConversationRef.current = false
      return
    }

    // 检查是否已经加载过（避免重复加载）
    if (hasLoadedConversationRef.current) {
      return
    }

    // 检查是否有 startWith state（从首页过来的），如果有则不尝试加载
    const state = location.state as { startWith?: string; agentId?: string } | null
    if (state?.startWith) {
      hasLoadedConversationRef.current = true
      setCurrentConversationId(null)
      setMessages([])
      return
    }

    hasLoadedConversationRef.current = true

    getConversation(id).then(conversation => {
      if (conversation) {
        setSelectedAgentId(conversation.agent_id)
        setCurrentConversationId(conversation.id)
        setCurrentConvData(conversation) // 保存当前会话对象
        console.log('[CanvasChatPage] 会话加载成功:', { id: conversation.id, agent_id: conversation.agent_id, agent_type: conversation.agent_type })

        if (conversation.messages && conversation.messages.length > 0) {
          const loadedMessages = conversation.messages.map((m) => {
            const typedM = m as ApiMessage
            return {
              role: typedM.role === 'system' ? 'assistant' : (typedM.role as 'assistant' | 'user'),
              content: typedM.content,
              id: typedM.id ? String(typedM.id) : generateId(),
              timestamp: typedM.timestamp ? new Date(typedM.timestamp).getTime() : Date.now()
            }
          })
          setMessages(loadedMessages as Message[])
        } else {
          setMessages([])
        }
      } else {
        console.error('[CanvasChatPage] 会话不存在:', id)
        setMessages([])
      }
    }).catch(err => {
      console.error('[CanvasChatPage] Failed to load conversation:', err)
      setMessages([])
    })
  }, [id, location, setSelectedAgentId, agentIdFromUrl, setMessages, setCurrentConversationId])

  // 处理消息发送
  const handleSubmitMessage = useCallback(() => {
    if (!inputMessage || typeof inputMessage !== 'string' || !inputMessage.trim()) return

    handleSendMessage(inputMessage)
  }, [inputMessage, handleSendMessage])

  // 如果 id 为 null，显示空状态
  if (!id) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-100">
            暂无会话
          </h2>
          <p className="text-gray-500 dark:text-gray-400">
            请从首页输入内容开始新对话
          </p>
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            返回首页
          </button>
        </div>
      </div>
    )
  }

  // 将 conversationMode 传递给 ChatContent 回调使用
  const ChatContentWithMode = useCallback((viewMode: 'chat' | 'preview', setViewMode: (mode: 'chat' | 'preview') => void) => (
    <div className="relative flex-1 flex flex-col min-h-0">
      <FloatingChatPanel
        messages={messages}
        inputMessage={inputMessage}
        setInputMessage={setInputMessage}
        handleSendMessage={handleSubmitMessage}
        isTyping={isTyping}
        agentName={getCurrentAgent()?.name || 'AI Assistant'}
        agentDescription="任务拆解助手"
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        isChatMinimized={isChatMinimized}
        setIsChatMinimized={setIsChatMinimized}
        onStopGeneration={handleStopGeneration}
        conversationMode={conversationMode}
        onConversationModeChange={handleConversationModeChange}
        hideModeSwitch={false}
      />
    </div>
  ), [messages, inputMessage, setInputMessage, handleSubmitMessage, isTyping, getCurrentAgent, isChatMinimized, setIsChatMinimized, handleStopGeneration, conversationMode, handleConversationModeChange])

  // 专家状态栏内容（使用 useMemo 避免重复创建）
  const ExpertBarContent = useMemo(() => (
    <ExpertStatusBar />
  ), [])

  // Artifact 区域内容（使用新的 ArtifactsArea 组件）
  const ArtifactContent = useMemo(() => (
    <ArtifactsArea
      isFullscreen={isArtifactFullscreen}
      onFullscreenToggle={() => setIsArtifactFullscreen(!isArtifactFullscreen)}
    />
  ), [isArtifactFullscreen])

  // 数据驱动：拆分专家状态栏和Artifacts区域的显示控制
  const showExpertBar = useMemo(() => {
    // 专家状态栏：仅在复杂模式（agent_type === 'ai'）显示
    if (!currentConvData) {
      return conversationMode === 'complex'
    }
    return currentConvData.agent_type === 'ai'
  }, [currentConvData, conversationMode])

  // Artifacts区域：始终显示（所有对话模式都可能生成需要Artifacts展示的内容）
  const showArtifacts = true

  return (
    <ArtifactProvider>
      {/* XPouchLayout - 直接渲染，不受外层容器限制 */}
      <XPouchLayout
        ExpertBarContent={ExpertBarContent}
        ArtifactContent={ArtifactContent}
        ChatContent={ChatContentWithMode}
        isChatMinimized={isChatMinimized}
        setIsChatMinimized={setIsChatMinimized}
        hasArtifact={showArtifacts}
        hideChatPanel={isArtifactFullscreen}
        showExpertBar={showExpertBar}
      />

      {/* 抽屉式专家详情 - 提升到最顶层，独立 stacking context */}
      <ExpertDrawer
        isOpen={isExpertDrawerOpen}
        onClose={() => setIsExpertDrawerOpen(false)}
        expertName={selectedExpert || '专家'}
      />

      {/* Artifact全屏预览 - 移动端全屏覆盖 */}
      {isArtifactFullscreen && (
        <div className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 dark:bg-black/70 lg:hidden">
          <div
            className="relative w-full max-w-[95vw] h-[90vh] bg-white dark:bg-slate-900 rounded-none shadow-2xl overflow-hidden flex flex-col border border-gray-200 dark:border-gray-800"
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={() => setIsArtifactFullscreen(false)} className="absolute top-4 right-4 z-10 p-2 rounded-full bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 transition-colors">
              <X className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </button>
            <ArtifactsArea isFullscreen={true} onFullscreenToggle={() => setIsArtifactFullscreen(false)} />
          </div>
        </div>
      )}

      {/* Artifact全屏预览 - 桌面端在主内容区居中 */}
      {isArtifactFullscreen && (
        <div
          className="hidden lg:block fixed right-0 top-0 bottom-0 z-[9999] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 dark:bg-black/70"
          style={{ left: sidebar.isCollapsed ? '0px' : '64px' }}
          onClick={() => setIsArtifactFullscreen(false)}
        >
          <div
            className="relative w-full max-w-[95vw] h-[calc(100vh-2rem)] bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden flex flex-col border border-gray-200 dark:border-gray-800"
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={() => setIsArtifactFullscreen(false)} className="absolute top-4 right-4 z-10 p-2 rounded-full bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 transition-colors">
              <X className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </button>
            <ArtifactsArea isFullscreen={true} onFullscreenToggle={() => setIsArtifactFullscreen(false)} />
          </div>
        </div>
      )}
    </ArtifactProvider>
  )
}
