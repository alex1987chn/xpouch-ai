import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, X } from 'lucide-react'
import { useChatStore } from '@/store/chatStore'
import { useChat } from '@/hooks/useChat'
import { useCanvasStore } from '@/store/canvasStore'
import { getConversation, type ApiMessage } from '@/services/api'
import { type Message } from '@/types'
import { generateId } from '@/utils/storage'
import FloatingChatPanel from './FloatingChatPanel'
import ExpertDrawer from './ExpertDrawer'
import XPouchLayout from './XPouchLayout'
import { useUserStore } from '@/store/userStore'
import ExpertStatusBar from './ExpertStatusBar'
import ArtifactsArea from './ArtifactsArea'
import { ArtifactProvider } from '@/providers/ArtifactProvider'

export default function CanvasChatPage() {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()

  // 从 URL 搜索参数获取 agentId
  const agentIdFromUrl = new URLSearchParams(location.search).get('agentId')

  // 从 location.state 获取初始对话模式（首页传递过来的）
  const initialMode = location.state?.mode || 'simple' as 'simple' | 'complex'

  // 对话模式状态
  const [conversationMode, setConversationMode] = useState<'simple' | 'complex'>(initialMode)

  // 判断是否是直连专家模式（非 sys-commander）
  const isDirectExpertMode = useMemo(() => {
    return !!(agentIdFromUrl && agentIdFromUrl !== 'sys-commander')
  }, [agentIdFromUrl])

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

  // 监听 agentId 变化，自动更新模式
  useEffect(() => {
    if (agentIdFromUrl === 'sys-commander') {
      setConversationMode('complex')
    } else if (agentIdFromUrl === 'sys-assistant') {
      setConversationMode('simple')
    } else {
      // 直连专家模式，使用 simple 模式（但实际上是直连专家）
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

    // 检查是否是临时ID（包含连字符），如果是则跳过API调用
    const isTempId = id.includes('-')
    if (isTempId) {
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

  // 将 isDirectExpertMode 传递给 ChatContent 回调使用
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
        onConversationModeChange={isDirectExpertMode ? undefined : setConversationMode}
        hideModeSwitch={isDirectExpertMode}
      />
    </div>
  ), [messages, inputMessage, setInputMessage, handleSubmitMessage, isTyping, getCurrentAgent, isChatMinimized, setIsChatMinimized, handleStopGeneration, conversationMode, setConversationMode, isDirectExpertMode])

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

  return (
    <ArtifactProvider>
      {/* XPouchLayout - 直接渲染，不受外层容器限制 */}
      <XPouchLayout
        ExpertBarContent={ExpertBarContent}
        ArtifactContent={ArtifactContent}
        ChatContent={ChatContentWithMode}
        isChatMinimized={isChatMinimized}
        setIsChatMinimized={setIsChatMinimized}
        hasArtifact={true}
        hideChatPanel={isArtifactFullscreen}
      />

      {/* 抽屉式专家详情 - 提升到最顶层，独立 stacking context */}
      <ExpertDrawer
        isOpen={isExpertDrawerOpen}
        onClose={() => setIsExpertDrawerOpen(false)}
        expertName={selectedExpert || '专家'}
      />

      {/* Artifact全屏预览 - 独立于布局之外，确保覆盖整个视口 */}
      {isArtifactFullscreen && (
        <div
          className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 dark:bg-black/70"
          onClick={() => setIsArtifactFullscreen(false)}
        >
          <div
            className="relative w-full max-w-[95vw] h-[90vh] md:h-[85vh] bg-white dark:bg-slate-900 rounded-none md:rounded-3xl shadow-2xl overflow-hidden flex flex-col border-0 md:border border-gray-200 dark:border-gray-800"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 内部关闭按钮（因为外层只负责关闭全屏） */}
            <button
              onClick={() => setIsArtifactFullscreen(false)}
              className="absolute top-4 right-4 z-10 p-2 rounded-full bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 transition-colors"
              title="关闭"
            >
              <X className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </button>

            <ArtifactsArea
              isFullscreen={true}
              onFullscreenToggle={() => setIsArtifactFullscreen(false)}
            />
          </div>
        </div>
      )}
    </ArtifactProvider>
  )
}
