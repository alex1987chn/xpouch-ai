import { useRef, useEffect, useState, useCallback } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useChatStore } from '@/store/chatStore'
import { useChat } from '@/hooks/useChat'
import { useCanvasStore } from '@/store/canvasStore'
import { getConversation, type ApiMessage } from '@/services/api'
import { generateId } from '@/utils/storage'
import { ArrowLeft, X, Code, FileText, Search, FileCode as HtmlIcon, FileText as TextIcon, Copy, Check } from 'lucide-react'
import InteractiveCanvas from './InteractiveCanvas'
import FloatingChatPanel from './FloatingChatPanel'
import FloatingExpertBar from './FloatingExpertBar'
import ExpertDrawer from './ExpertDrawer'
import XPouchLayout from './XPouchLayout'
import Sidebar from './Sidebar'
import { useUserStore } from '@/store/userStore'
import { SettingsDialog } from './SettingsDialog'
import { PersonalSettingsDialog } from './PersonalSettingsDialog'
import { cn } from '@/lib/utils'
import { CodeArtifact, DocArtifact, SearchArtifact, HtmlArtifact, TextArtifact } from './artifacts'

export default function CanvasChatPage() {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { fetchUser } = useUserStore()

  // 确保用户信息已加载
  useEffect(() => {
    fetchUser()
  }, [fetchUser])

  const handledStartWithRef = useRef(false)
  const hasLoadedConversationRef = useRef(false)
  const [isExpertDrawerOpen, setIsExpertDrawerOpen] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isPersonalSettingsOpen, setIsPersonalSettingsOpen] = useState(false)
  const [selectedExpert] = useState('')
  const [isChatMinimized, setIsChatMinimized] = useState(false)
  const [isArtifactFullscreen, setIsArtifactFullscreen] = useState(false) // 新增：artifact 全屏状态

  const {
    messages,
    isTyping,
    inputMessage,
    setInputMessage,
    handleSendMessage,
    handleStopGeneration,
    activeExpertId,
    setActiveExpertId
  } = useChat()

  const {
    setSelectedAgentId,
    setMessages,
    setCurrentConversationId,
    getCurrentAgent
  } = useChatStore()

  const { setMagicColor, artifactType, artifactContent } = useCanvasStore()
  const { user } = useUserStore()

  // 处理设置点击
  const handleSettingsClick = () => {
    setIsSettingsOpen(true)
  }

  const handlePersonalSettingsClick = () => {
    setIsPersonalSettingsOpen(true)
  }

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
      console.log('[CanvasChatPage] Skipping API load for startWith, will handle later:', id)
      hasLoadedConversationRef.current = true
      setCurrentConversationId(null)
      setMessages([])
      return
    }

    // 检查是否是临时ID（包含连字符），如果是则跳过API调用
    const isTempId = id.includes('-')
    if (isTempId) {
      console.log('[CanvasChatPage] Detected temporary ID, skipping API load:', id)
      hasLoadedConversationRef.current = true
      setCurrentConversationId(null)
      setMessages([])
      return
    }

    hasLoadedConversationRef.current = true
    console.log('[CanvasChatPage] Loading conversation:', id)

    getConversation(id).then(conversation => {
      console.log('[CanvasChatPage] Loaded conversation:', conversation)
      if (conversation) {
        setSelectedAgentId(conversation.agent_id)
        setCurrentConversationId(conversation.id)

        if (conversation.messages && conversation.messages.length > 0) {
          console.log('[CanvasChatPage] Loading messages:', conversation.messages.length)
          const loadedMessages = conversation.messages.map((m: ApiMessage) => ({
            role: m.role === 'system' ? 'assistant' : m.role,
            content: m.content,
            id: m.id ? String(m.id) : generateId(),
            timestamp: m.timestamp ? new Date(m.timestamp).getTime() : Date.now()
          }))
          setMessages(loadedMessages)
        } else {
          console.log('[CanvasChatPage] No messages found, setting empty')
          setMessages([])
        }
      } else {
        console.log('[CanvasChatPage] Conversation is null')
        setMessages([])
      }
    }).catch(err => {
      console.error('[CanvasChatPage] Failed to load conversation:', err)
      // 清空消息列表，准备开始新会话
      setMessages([])
      setCurrentConversationId(null)
    })
  }, [id, location.state, setCurrentConversationId, setMessages, setSelectedAgentId, navigate])

  // Handle startWith message from navigation state
  useEffect(() => {
    const state = location.state as { startWith?: string; agentId?: string } | null
    if (state?.agentId) {
      setSelectedAgentId(state.agentId)
    }

    if (state?.startWith && !handledStartWithRef.current) {
      handledStartWithRef.current = true
      console.log('[CanvasChatPage] Auto-sending startWith message:', state.startWith)
      handleSendMessage(state.startWith)
      navigate(location.pathname + location.search, { replace: true, state: {} })
    }
  }, [location, handleSendMessage, navigate, setSelectedAgentId])

  // 处理消息发送
  const handleSubmitMessage = useCallback(() => {
    if (!inputMessage || typeof inputMessage !== 'string' || !inputMessage.trim()) return

    setIsProcessing(true) // 开始处理，触发粒子汇聚动画
    handleSendMessage(inputMessage)

    // 2秒后恢复处理状态（模拟AI开始思考）
    setTimeout(() => setIsProcessing(false), 2000)
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

  // 创建聊天内容组件
  const ChatContent = (viewMode: 'chat' | 'preview', setViewMode: (mode: 'chat' | 'preview') => void) => (
    <div className="relative flex-1 flex flex-col min-h-0">
      {/* 专家调度看板 - 浮动在顶部，z-index 高于聊天面板 */}
      {activeExpertId && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[100]">
          <FloatingExpertBar activeExpertId={activeExpertId} />
        </div>
      )}

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
      />
    </div>
  )

  // 创建画布内容组件
  const CanvasContent = (
    <InteractiveCanvas
      artifactType={artifactType}
      artifactContent={artifactContent}
      isProcessing={isProcessing}
      isFullscreen={isArtifactFullscreen}
      setIsFullscreen={setIsArtifactFullscreen}
      className={cn(
        'w-full h-full transition-all duration-500',
        activeExpertId === 'coder' && 'ring-2 ring-blue-500/30'
      )}
    />
  )

  // 创建侧边栏内容
  const SidebarContent = (
    <Sidebar
      isCollapsed={false}
      currentPlan={user?.plan as 'Free' | 'Pilot' | 'Maestro'}
      onCreateAgent={() => navigate('/create-agent')}
      onSettingsClick={handleSettingsClick}
      onPersonalSettingsClick={handlePersonalSettingsClick}
    />
  )

  return (
    <>
      {/* 设置对话框 - 提升到最顶层，独立 stacking context */}
      <div className="relative z-[250]">
        <SettingsDialog
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
        />
      </div>

      {/* 个人设置对话框 - 提升到最顶层，独立 stacking context */}
      <div className="relative z-[250]">
        <PersonalSettingsDialog
          isOpen={isPersonalSettingsOpen}
          onClose={() => setIsPersonalSettingsOpen(false)}
        />
      </div>

      {/* 抽屉式专家详情 - 提升到最顶层，独立 stacking context */}
      <ExpertDrawer
        isOpen={isExpertDrawerOpen}
        onClose={() => setIsExpertDrawerOpen(false)}
        expertName={selectedExpert || '专家'}
      />

      {/* 主内容区 - 独立 stacking context，层级低于侧边栏 */}
      <div className="relative z-[50] w-full h-full">
        <XPouchLayout
          SidebarContent={SidebarContent}
          CanvasContent={CanvasContent}
          ChatContent={ChatContent}
          isChatMinimized={isChatMinimized}
          setIsChatMinimized={setIsChatMinimized}
          hasArtifact={!!artifactType}
          hideChatPanel={isArtifactFullscreen}
        />
      </div>

      {/* Artifact全屏预览 - 提升到根级别，确保能够覆盖所有元素 */}
      <AnimatePresence>
        {isArtifactFullscreen && artifactType && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[99999] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 dark:bg-black/70"
            onClick={() => setIsArtifactFullscreen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.3 }}
              className="relative w-full max-w-[95vw] h-[90vh] bg-white dark:bg-slate-900 rounded-none md:rounded-3xl shadow-2xl overflow-hidden flex flex-col border-0 md:border border-gray-200 dark:border-gray-800"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className={cn(
                'w-full px-6 py-4 flex items-center justify-between border-b transition-colors',
                artifactType === 'code' && 'bg-gradient-to-r from-indigo-500 to-purple-600 dark:from-indigo-600 dark:to-purple-700 border-indigo-200 dark:border-indigo-800',
                artifactType === 'markdown' && 'bg-gradient-to-r from-emerald-500 to-teal-600 dark:from-emerald-600 dark:to-teal-700 border-emerald-200 dark:border-emerald-800',
                artifactType === 'search' && 'bg-gradient-to-r from-violet-500 to-pink-600 dark:from-violet-600 dark:to-pink-700 border-violet-200 dark:border-violet-800',
                artifactType === 'html' && 'bg-gradient-to-r from-orange-500 to-amber-600 dark:from-orange-600 dark:to-amber-700 border-orange-200 dark:border-orange-800',
                artifactType === 'text' && 'bg-gradient-to-r from-slate-500 to-gray-600 dark:from-slate-600 dark:to-gray-700 border-slate-200 dark:border-slate-800'
              )}>
                <div className="flex items-center gap-3">
                  {artifactType === 'code' && <Code className="w-5 h-5 text-white" />}
                  {artifactType === 'markdown' && <FileText className="w-5 h-5 text-white" />}
                  {artifactType === 'search' && <Search className="w-5 h-5 text-white" />}
                  {artifactType === 'html' && <FileCode className="w-5 h-5 text-white" />}
                  {artifactType === 'text' && <FileText className="w-5 h-5 text-white" />}
                  <span className="text-white font-semibold text-base">
                    {artifactType === 'code' && '编程专家'}
                    {artifactType === 'markdown' && '文档预览'}
                    {artifactType === 'search' && '搜索结果'}
                    {artifactType === 'html' && 'HTML预览'}
                    {artifactType === 'text' && '文本内容'}
                  </span>
                </div>
                <button
                  onClick={() => setIsArtifactFullscreen(false)}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                  title="关闭"
                >
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-auto p-6 bg-gray-50 dark:bg-slate-950">
                {artifactType === 'code' && (
                  <CodeArtifact content={artifactContent} />
                )}
                {artifactType === 'markdown' && (
                  <DocArtifact content={artifactContent} />
                )}
                {artifactType === 'search' && (
                  <SearchArtifact />
                )}
                {artifactType === 'html' && (
                  <HtmlArtifact content={artifactContent} />
                )}
                {artifactType === 'text' && (
                  <TextArtifact content={artifactContent} />
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
