import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, X } from 'lucide-react'
import { useChatStore } from '@/store/chatStore'
import { useChat } from '@/hooks/useChat'
import { useCanvasStore } from '@/store/canvasStore'
import { getConversation, type ApiMessage } from '@/services/api'
import { type Message, type Conversation, type Artifact } from '@/types'
import FloatingChatPanel from './FloatingChatPanel'
import ExpertDrawer from './ExpertDrawer'
import XPouchLayout from './XPouchLayout'
import { useUserStore } from '@/store/userStore'
import { useApp } from '@/providers/AppProvider'
import ExpertStatusBar from './ExpertStatusBar'
import ArtifactsArea from './ArtifactsArea'
import { ArtifactProvider, useArtifacts } from '@/providers/ArtifactProvider'
import { SYSTEM_AGENTS } from '@/constants/agents'
import { logger } from '@/utils/logger'

function CanvasChatPageContent() {
  logger.info('[CanvasChatPage] CanvasChatPageContent组件渲染')
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()

  // 存储当前会话对象（用于数据驱动 UI）
  const [currentConvData, setCurrentConvData] = useState<Conversation | null>(null)

  logger.info('[CanvasChatPage] 当前路由id:', id)

  // ============================================
  // 辅助函数：从消息中检测 artifacts
  // ============================================
  function detectArtifactsFromMessages(messages: Message[]): Artifact[] {
    const artifacts: Artifact[] = []
    let artifactIndex = 0

    messages.forEach((msg) => {
      if (msg.role !== 'assistant') return

      // 检测代码块 ```language code ```
      const codeBlockRegex = /```(\w+)?\n([\s\S]*?)\n```/g
      let match
      while ((match = codeBlockRegex.exec(msg.content)) !== null) {
        const language = match[1] || 'text'
        const codeContent = match[2]
        artifacts.push({
          id: crypto.randomUUID(),
          type: 'code' as any,
          content: codeContent,
          title: `${language === 'text' ? '代码' : language}${artifactIndex + 1}`,
          timestamp: new Date().toISOString()
        })
        artifactIndex++
      }

      // 检测HTML块
      if (msg.content.includes('```html') || msg.content.includes('<!DOCTYPE html>') || /<html[\s>]/i.test(msg.content)) {
        const hasHtmlCodeBlock = artifacts.some(a => a.type === 'html')
        if (!hasHtmlCodeBlock) {
          const htmlMatch = msg.content.match(/```html\n([\s\S]*?)\n```/i) || msg.content.match(/<html[\s\S]*?<\/html>/is)
          if (htmlMatch) {
            artifacts.push({
              id: crypto.randomUUID(),
              type: 'html' as any,
              content: htmlMatch[1] || htmlMatch[0],
              title: `网页${artifactIndex + 1}`,
              timestamp: new Date().toISOString()
            })
            artifactIndex++
          }
        }
      }

      // 检测复杂 Markdown（长度>500字 + 包含复杂结构）
      const hasComplexStructure = /#{2,}|^[\s]*[-*+] |^\d+\./m.test(msg.content)
      const hasCodeBlock = /```[\s\S]*?```/.test(msg.content)
      const textLength = msg.content.replace(/```[\s\S]*?```/g, '').trim().length

      if (textLength > 500 && hasComplexStructure && !hasCodeBlock && artifactIndex === 0) {
        artifacts.push({
          id: crypto.randomUUID(),
          type: 'markdown' as any,
          content: msg.content,
          title: `文档${artifactIndex + 1}`,
          timestamp: new Date().toISOString()
        })
        artifactIndex++
      }
    })

    return artifacts
  }

  // 从 URL 搜索参数获取 agentId
  const agentIdFromUrl = new URLSearchParams(location.search).get('agentId')

  // 根据 URL 中的 agentId 确定对话模式
  const initialConversationMode = useMemo(() => {
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
  const previousConversationIdRef = useRef<string | null>(null)
  const [isExpertDrawerOpen, setIsExpertDrawerOpen] = useState(false)
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

  const {
    addArtifactsBatch: addArtifactsFromProvider,
    selectExpert,
    clearSessions
  } = useArtifacts()

  const { selectedExpert } = useCanvasStore()
  const { sidebar } = useApp()

  // 处理对话模式切换
  const handleConversationModeChange = useCallback((newMode: 'simple' | 'complex') => {
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
      logger.info(`[CanvasChatPage] 收到 startWith 消息: ${state.startWith.substring(0, 50)}...`)

      // 确保当前会话ID正确设置
      if (id) {
        useChatStore.getState().setCurrentConversationId(id)
      }
      
      // 等待store状态更新后再发送消息
      setTimeout(() => {
        // 确保 selectedAgentId 已从 URL 参数正确设置后再发送消息
        // 修复：直接使用 agentIdFromUrl 而不是依赖 store 中的 selectedAgentId
        if (agentIdFromUrl) {
          // 直接发送消息，使用URL中的agentId
          handleSendMessage(state.startWith, agentIdFromUrl)
          navigate(location.pathname + location.search, { replace: true, state: {} })
        } else {
          logger.warn('[CanvasChatPage] 没有agentIdFromUrl，使用默认agent')
          // 使用默认助手发送
          handleSendMessage(state.startWith, SYSTEM_AGENTS.DEFAULT_CHAT)
          navigate(location.pathname, { replace: true, state: {} })
        }
      }, 100) // 短暂延迟确保store状态更新
    }
  }, [location, handleSendMessage, navigate, agentIdFromUrl, id])

  // 初始化或加载会话
  useEffect(() => {
    logger.info('[CanvasChatPage] useEffect触发，id:', id)

    if (!id) {
      logger.info('[CanvasChatPage] id为null，清空状态')
      setCurrentConversationId(null)
      setMessages([])
      hasLoadedConversationRef.current = false
      previousConversationIdRef.current = null
      return
    }

    // 检查是否有 startWith state（从首页过来的），如果有则不尝试加载
    const state = location.state as { startWith?: string; agentId?: string } | null
    logger.info('[CanvasChatPage] location.state:', state)

    if (state?.startWith) {
      logger.info('[CanvasChatPage] 有startWith状态，跳过加载')
      hasLoadedConversationRef.current = true
      setCurrentConversationId(id)
      previousConversationIdRef.current = id
      return
    }

    // 检查是否是同一个会话（避免重复加载）
    // 注意：只有当store中已经有正确的会话ID和消息时，才跳过加载
    const currentStoreId = useChatStore.getState().currentConversationId;
    const currentMessages = useChatStore.getState().messages;

    logger.info('[CanvasChatPage] currentStoreId:', currentStoreId, 'currentMessages.length:', currentMessages.length, 'hasLoadedConversation:', hasLoadedConversationRef.current)

    // 修复：如果是页面刷新（store中有缓存消息），强制从数据库重新加载
    // 判断标准：previousConversationId不为null且与当前ID相同，但store可能是从localStorage恢复的旧数据
    const isRefresh = previousConversationIdRef.current !== null && previousConversationIdRef.current === id

    logger.info('[CanvasChatPage] previousConversationId:', previousConversationIdRef.current, 'isRefresh:', isRefresh)

    if (id === previousConversationIdRef.current && hasLoadedConversationRef.current && id === currentStoreId && currentMessages.length > 0 && !isRefresh) {
      logger.info('[CanvasChatPage] 跳过加载（同一会话且已加载）')
      return
    }

    logger.info('[CanvasChatPage] 开始加载会话:', id)

    hasLoadedConversationRef.current = true
    previousConversationIdRef.current = id

    getConversation(id).then(conversation => {
      logger.info('[CanvasChatPage] 加载会话:', id, 'agent_type:', conversation?.agent_type, 'messages:', conversation?.messages?.length || 0)

      if (conversation) {
        setSelectedAgentId(conversation.agent_id)
        setCurrentConversationId(conversation.id)
        setCurrentConvData(conversation) // 保存当前会话对象

        // 加载 messages
        if (conversation.messages && conversation.messages.length > 0) {
          logger.info('[CanvasChatPage] 开始加载消息，数量:', conversation.messages.length)

          // 统计不同类型的消息数量
          const messageTypes = conversation.messages.reduce((acc, m) => {
            const typedM = m as ApiMessage
            acc[typedM.role] = (acc[typedM.role] || 0) + 1
            return acc
          }, {} as Record<string, number>)
          logger.info('[CanvasChatPage] 消息类型统计:', messageTypes)

          const loadedMessages = conversation.messages.map((m) => {
            const typedM = m as ApiMessage
            // 修复：保留system角色，不转换为assistant，确保系统消息正确显示
            // system消息用于显示专家完成、任务计划等信息
            const message = {
              role: typedM.role as 'user' | 'assistant' | 'system',
              content: typedM.content,
              id: typedM.id ? String(typedM.id) : crypto.randomUUID(),
              timestamp: typedM.timestamp ? new Date(typedM.timestamp).getTime() : Date.now()
            }
            logger.debug('[CanvasChatPage] 加载消息:', message.role, 'content:', message.content.substring(0, 50))
            return message
          })

          logger.info('[CanvasChatPage] 加载完成，设置消息数量:', loadedMessages.length, '消息类型:', loadedMessages.map(m => m.role))
          setMessages(loadedMessages as Message[])

          // 加载 artifacts（如果存在）
          if (conversation.agent_type === 'ai' && conversation.task_session) {
            // 复杂模式：从 task_session.sub_tasks 加载 artifacts
            const taskSession = conversation.task_session as any
            if (taskSession?.sub_tasks) {
              // 清空旧数据
              clearSessions()

              // 为每个专家创建 artifact session
              taskSession.sub_tasks.forEach((subTask: any, idx: number) => {
                const expertType = subTask.expert_type || `expert-${idx}`
                const artifacts: Artifact[] = []

                // 如果有 artifacts 字段，转换为 Artifact 类型
                if (subTask.artifacts && Array.isArray(subTask.artifacts)) {
                  subTask.artifacts.forEach((artifactData: any, artIdx: number) => {
                    artifacts.push({
                      id: crypto.randomUUID(),
                      type: artifactData.type || 'code',
                      content: artifactData.content || '',
                      title: artifactData.title || `Artifact ${artIdx + 1}`,
                      timestamp: new Date().toISOString()
                    })
                  })
                }

                // 添加到 canvasStore
                if (artifacts.length > 0) {
                  addArtifactsFromProvider(expertType, artifacts)
                }
              })
            }
          } else {
            // 简单模式：从 messages 检测 artifacts
            const detectedArtifacts = detectArtifactsFromMessages(loadedMessages)
            if (detectedArtifacts.length > 0) {
              // 清空旧数据
              clearSessions()

              // 使用 'simple' 作为专家类型
              const simpleArtifacts = detectedArtifacts.map((art, idx) => ({
                ...art,
                title: art.type === 'code' ? `代码${idx + 1}` :
                        art.type === 'html' ? `网页${idx + 1}` :
                        `文档${idx + 1}`
              }))

              // 添加到 canvasStore
              addArtifactsFromProvider('simple', simpleArtifacts)

              // 自动选中第一个 artifact
              selectExpert('simple')
              logger.info(`[CanvasChatPage] 从消息恢复 ${simpleArtifacts.length} 个 artifacts`)
            } else {
              // 即使没有检测到artifacts，也要清空旧的sessions
              clearSessions()
              logger.info('[CanvasChatPage] 刷新页面后没有检测到artifacts，清空sessions')
            }
          }
        } else {
          setMessages([])
        }
      } else {
        logger.error('[CanvasChatPage] 会话不存在:', id)
        setMessages([])
      }
    }).catch(err => {
      // 检查是否是 404 错误（会话不存在）
      const isNotFound = err.message?.includes('404') || 
                         err.message?.includes('Not Found') ||
                         (err.response && err.response.status === 404);
      
      if (!isNotFound) {
        logger.error('[CanvasChatPage] Failed to load conversation:', err);
      } else {
        logger.warn('[CanvasChatPage] 会话不存在（临时ID或尚未创建）:', id);
      }
      setMessages([]);
      setCurrentConversationId(null);
    })
  }, [id, location.state, agentIdFromUrl]) // 只依赖id和location.state，其他函数引用不需要作为依赖

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
        onStopGeneration={handleStopGeneration}
        conversationMode={conversationMode}
        onConversationModeChange={handleConversationModeChange}
        hideModeSwitch={false}
      />
    </div>
  ), [messages, inputMessage, setInputMessage, handleSubmitMessage, isTyping, getCurrentAgent, handleStopGeneration, conversationMode, handleConversationModeChange])

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
    <>
      {/* XPouchLayout - 直接渲染，不受外层容器限制 */}
      <XPouchLayout
        ExpertBarContent={ExpertBarContent}
        ArtifactContent={ArtifactContent}
        ChatContent={ChatContentWithMode}
        hasArtifact={showArtifacts}
        hideChatPanel={isArtifactFullscreen}
        showExpertBar={showExpertBar}
        isSidebarOpen={!sidebar.isCollapsed} // 侧边栏展开时为true
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
          className="hidden lg:block fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 dark:bg-black/70"
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
    </>
  )
}

// 外层组件，用 ArtifactProvider 包裹 CanvasChatPageContent
export default function CanvasChatPage() {
  return (
    <ArtifactProvider>
      <CanvasChatPageContent />
    </ArtifactProvider>
  )
}
