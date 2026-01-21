import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, X, Code, FileText, Search, FileCode as HtmlIcon, FileText as TextIcon, Copy, Check, Maximize2 } from 'lucide-react'
import { useChatStore } from '@/store/chatStore'
import { useChat } from '@/hooks/useChat'
import { useCanvasStore } from '@/store/canvasStore'
import type { ExpertResult } from '@/store/canvasStore'
import { getConversation, type ApiMessage } from '@/services/api'
import { generateId } from '@/utils/storage'
import FloatingChatPanel from './FloatingChatPanel'
import FloatingExpertBar from './FloatingExpertBar'
import ExpertDrawer from './ExpertDrawer'
import XPouchLayout from './XPouchLayout'
import { useUserStore } from '@/store/userStore'
import { cn } from '@/lib/utils'
import { CodeArtifact, DocArtifact, SearchArtifact, HtmlArtifact, TextArtifact } from './artifacts'
import ExpertStatusBar, { ExpertPreviewModal } from './ExpertStatusBar'
import { useApp } from '@/providers/AppProvider'

export default function CanvasChatPage() {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { dialogs } = useApp()

  // 从 URL 搜索参数获取 agentId
  const agentIdFromUrl = new URLSearchParams(location.search).get('agentId')
  const { fetchUser } = useUserStore()

  // 确保用户信息已加载
  useEffect(() => {
    fetchUser()
  }, [fetchUser])

  const handledStartWithRef = useRef(false)
  const hasLoadedConversationRef = useRef(false)
  const [isExpertDrawerOpen, setIsExpertDrawerOpen] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isChatMinimized, setIsChatMinimized] = useState(false)
  const [isArtifactFullscreen, setIsArtifactFullscreen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [previewExpert, setPreviewExpert] = useState<ExpertResult | null>(null)


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

  const { setMagicColor, artifactType, artifactContent, setArtifact, addExpertResult, updateExpertResult, expertResults, selectedExpert } = useCanvasStore()
  const { user } = useUserStore()
  const assistantMessageIdRef = useRef<string | null>(null)

  // 监听选中的专家变化，切换到对应的 artifact（使用 useMemo 避免频繁调用）
  const selectedExpertArtifact = useMemo(() => {
    const expert = expertResults.find(e => e.expertType === selectedExpert)
    return expert?.artifact || null
  }, [selectedExpert, expertResults])

  // 当专家 artifact 变化时更新
  useEffect(() => {
    if (selectedExpertArtifact) {
      setArtifact(selectedExpertArtifact.type, selectedExpertArtifact.content)
    }
  }, [selectedExpertArtifact, setArtifact])

  // 处理复制
  const handleCopy = async () => {
    if (!artifactContent) return
    try {
      await navigator.clipboard.writeText(artifactContent)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
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

  // Handle startWith message from navigation state and URL search params
  useEffect(() => {
    const state = location.state as { startWith?: string; agentId?: string } | null

    // 优先从 state 获取 agentId，其次从 URL 搜索参数获取
    if (state?.agentId) {
      setSelectedAgentId(state.agentId)
    } else if (agentIdFromUrl) {
      setSelectedAgentId(agentIdFromUrl)
    }

    if (state?.startWith && !handledStartWithRef.current) {
      handledStartWithRef.current = true
      console.log('[CanvasChatPage] Auto-sending startWith message:', state.startWith)
      handleSendMessage(state.startWith)
      navigate(location.pathname + location.search, { replace: true, state: {} })
    }
  }, [location, handleSendMessage, navigate, setSelectedAgentId, agentIdFromUrl])

  // 处理消息发送
  const handleSubmitMessage = useCallback(() => {
    if (!inputMessage || typeof inputMessage !== 'string' || !inputMessage.trim()) return

    setIsProcessing(true)
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

  // 获取当前选中的专家结果
  const selectedExpertResult = expertResults.find(e => e.expertType === selectedExpert)

  // 获取自定义标题（优先级：AI 返回 > 默认专家名称）
  const getArtifactTitle = useCallback(() => {
    // 首先检查 Artifact 是否有自定义标题
    if (selectedExpertResult?.artifact?.title) {
      return selectedExpertResult.artifact.title
    }
    // 其次检查 ExpertResult 是否有自定义标题
    if (selectedExpertResult?.title) {
      return selectedExpertResult.title
    }
    // 最后回退到默认专家名称
    const expertNames: Record<string, string> = {
      code: '编程专家',
      markdown: '写作专家',
      search: '搜索专家',
      html: 'HTML 生成',
      text: '文本生成'
    }
    return expertNames[artifactType || ''] || 'AI 生成的结果'
  }, [selectedExpertResult?.artifact?.title, selectedExpertResult?.title, artifactType])

  // 颜色和图标映射（使用 useMemo 避免重复创建）
  const expertColors = useMemo(() => ({
    code: { from: 'from-indigo-500', to: 'to-purple-600' },
    markdown: { from: 'from-emerald-500', to: 'to-teal-600' },
    search: { from: 'from-violet-500', to: 'to-pink-600' },
    html: { from: 'from-orange-500', to: 'to-amber-600' },
    text: { from: 'from-slate-500', to: 'to-gray-600' }
  }), [])

  // 图标映射（用于标题栏）
  const expertIcons = useMemo(() => ({
    code: Code,
    markdown: FileText,
    search: Search,
    html: HtmlIcon,
    text: TextIcon
  }), [])

  // Artifact显示内容（使用 useMemo 避免重复创建）
  const ArtifactContent = useMemo(() => (
    <>
      {artifactType ? (
        <div className="w-full h-full flex flex-col">
          <div className={cn(
            'rounded-2xl',
            'bg-white dark:bg-slate-900',
            'shadow-2xl shadow-black/10 dark:shadow-black/40',
            'overflow-hidden',
            'flex-1 flex flex-col relative z-10'
          )}>
            <div className="relative z-20 flex-shrink-0">
              <div
                className={cn(
                  'w-full px-4 py-2.5 flex items-center justify-between',
                  artifactType && expertColors[artifactType]
                    ? `bg-gradient-to-r ${expertColors[artifactType].from} ${expertColors[artifactType].to}`
                    : 'bg-white/90 dark:bg-slate-900/90 backdrop-blur-md'
                )}
              >
                <div className="flex items-center gap-2">
                  {artifactType === 'code' && <Code className="w-4 h-4 text-white" />}
                  {artifactType === 'markdown' && <FileText className="w-4 h-4 text-white" />}
                  {artifactType === 'search' && <Search className="w-4 h-4 text-white" />}
                  {artifactType === 'html' && <HtmlIcon className="w-4 h-4 text-white" />}
                  {artifactType === 'text' && <TextIcon className="w-4 h-4 text-white" />}
                  <span className="text-white text-sm font-medium">
                    {getArtifactTitle()}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopy}
                    className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
                    title={copied ? '已复制' : '复制'}
                  >
                    {copied ? (
                      <Check className="w-4 h-4 text-white" />
                    ) : (
                      <Copy className="w-4 h-4 text-white" />
                    )}
                  </button>
                  <button
                    onClick={() => setIsArtifactFullscreen(true)}
                    className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
                    title="放大预览"
                  >
                    <Maximize2 className="w-4 h-4 text-white" />
                  </button>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              {artifactType === 'code' && (
                <div className="w-full h-full overflow-y-auto overflow-x-hidden scrollbar-thin touch-pan-y touch-pinch-zoom">
                  <CodeArtifact content={artifactContent} />
                </div>
              )}
              {artifactType === 'markdown' && (
                <div className="w-full h-full overflow-y-auto overflow-x-hidden scrollbar-thin touch-pan-y touch-pinch-zoom">
                  <DocArtifact content={artifactContent} />
                </div>
              )}
              {artifactType === 'search' && (
                <div className="w-full h-full overflow-y-auto overflow-x-hidden scrollbar-thin touch-pan-y touch-pinch-zoom">
                  <SearchArtifact />
                </div>
              )}
              {artifactType === 'html' && (
                <div className="w-full h-full overflow-y-auto overflow-x-hidden scrollbar-thin touch-pan-y touch-pinch-zoom">
                  <HtmlArtifact content={artifactContent} />
                </div>
              )}
              {artifactType === 'text' && (
                <div className="w-full h-full overflow-y-auto overflow-x-hidden scrollbar-thin touch-pan-y touch-pinch-zoom">
                  <TextArtifact content={artifactContent} />
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  ), [artifactType, artifactContent, handleCopy, copied, getArtifactTitle, expertColors, expertIcons])

  // 专家状态栏内容（使用 useMemo 避免重复创建）
  const ExpertBarContent = useMemo(() => (
    <ExpertStatusBar previewExpert={previewExpert} setPreviewExpert={setPreviewExpert} />
  ), [previewExpert, setPreviewExpert])

  // 创建聊天内容组件（使用 useCallback 避免重复创建）
  const ChatContent = useCallback((viewMode: 'chat' | 'preview', setViewMode: (mode: 'chat' | 'preview') => void) => (
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
  ), [messages, inputMessage, setInputMessage, handleSubmitMessage, isTyping, getCurrentAgent, isChatMinimized, setIsChatMinimized, handleStopGeneration, activeExpertId])

  return (
    <>
      {/* 抽屉式专家详情 - 提升到最顶层，独立 stacking context */}
      <ExpertDrawer
        isOpen={isExpertDrawerOpen}
        onClose={() => setIsExpertDrawerOpen(false)}
        expertName={selectedExpert || '专家'}
      />

      {/* XPouchLayout - 直接渲染，不受外层容器限制 */}
      <XPouchLayout
        ExpertBarContent={ExpertBarContent}
        ArtifactContent={ArtifactContent}
        ChatContent={ChatContent}
        isChatMinimized={isChatMinimized}
        setIsChatMinimized={setIsChatMinimized}
        hasArtifact={!!artifactType}
        hideChatPanel={isArtifactFullscreen}
      />

      {/* Artifact全屏预览 - 只在交互区域内显示 */}
      {isArtifactFullscreen && artifactType && (
        <div
          className="absolute inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 dark:bg-black/70"
          onClick={() => setIsArtifactFullscreen(false)}
        >
          <div
            className="relative w-full max-w-[95vw] h-[90vh] md:h-[85vh] bg-white dark:bg-slate-900 rounded-none md:rounded-3xl shadow-2xl overflow-hidden flex flex-col border-0 md:border border-gray-200 dark:border-gray-800"
            onClick={(e) => e.stopPropagation()}
          >
              {/* Header - 性能优化：移除渐变，使用纯色 */}
              <div className={cn(
                'w-full px-6 py-4 flex items-center justify-between border-b',
                'bg-white dark:bg-slate-900',
                'border-gray-200 dark:border-slate-800'
              )}>
                <div className="flex items-center gap-3">
                  {artifactType === 'code' && <Code className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />}
                  {artifactType === 'markdown' && <FileText className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />}
                  {artifactType === 'search' && <Search className="w-5 h-5 text-violet-600 dark:text-violet-400" />}
                  {artifactType === 'html' && <HtmlIcon className="w-5 h-5 text-orange-600 dark:text-orange-400" />}
                  {artifactType === 'text' && <TextIcon className="w-5 h-5 text-slate-600 dark:text-slate-400" />}
                  <span className="text-gray-900 dark:text-gray-100 font-semibold text-base">
                    {getArtifactTitle()}
                  </span>
                </div>
                <button
                  onClick={() => setIsArtifactFullscreen(false)}
                  className="p-2 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
                  title="关闭"
                >
                  <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 bg-gray-50 dark:bg-slate-950 smooth-scroll touch-pan-y touch-pinch-zoom">
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
            </div>
          </div>
        )}

      {/* 专家详情预览弹窗 - 提升到根级别，确保能够覆盖所有元素 */}
      {previewExpert && (
        <ExpertPreviewModal
          expert={previewExpert}
          onClose={() => setPreviewExpert(null)}
        />
      )}
    </>
  )
}

