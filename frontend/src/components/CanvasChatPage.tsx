import { useRef, useEffect, useState, useCallback } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import { useChatStore } from '@/store/chatStore'
import { useChat } from '@/hooks/useChat'
import { useManualArtifact } from '@/hooks/useArtifactListener'
import { useCanvasStore } from '@/store/canvasStore'
import { getConversation } from '@/services/api'
import { generateId } from '@/utils/storage'
import { ArrowLeft } from 'lucide-react'
import InteractiveCanvas from './InteractiveCanvas'
import FloatingChatPanel from './FloatingChatPanel'
import ExpertDrawer from './ExpertDrawer'
import XPouchLayout from './XPouchLayout'
import Sidebar from './Sidebar'
import { useUserStore } from '@/store/userStore'
import { SettingsDialog } from './SettingsDialog'
import { PersonalSettingsDialog } from './PersonalSettingsDialog'

export default function CanvasChatPage() {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()

  const handledStartWithRef = useRef(false)
  const hasLoadedConversationRef = useRef(false)
  const [isExpertDrawerOpen, setIsExpertDrawerOpen] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isPersonalSettingsOpen, setIsPersonalSettingsOpen] = useState(false)
  const [selectedExpert] = useState('')
  const [isChatMinimized, setIsChatMinimized] = useState(false)

  // 移动端右滑返回
  const touchStartXRef = useRef(0)
  const [swipeProgress, setSwipeProgress] = useState(0)
  const swipeThreshold = 100 // 触发返回的滑动阈值

  const {
    messages,
    isTyping,
    inputMessage,
    setInputMessage,
    handleSendMessage
  } = useChat()

  const {
    setSelectedAgentId,
    setMessages,
    setCurrentConversationId,
    getCurrentAgent
  } = useChatStore()

  const { setMagicColor } = useCanvasStore()
  const { artifactType, artifactContent } = useManualArtifact()
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

    hasLoadedConversationRef.current = true
    console.log('[CanvasChatPage] Loading conversation:', id)

    getConversation(id).then(conversation => {
      console.log('[CanvasChatPage] Loaded conversation:', conversation)
      if (conversation) {
        setSelectedAgentId(conversation.agent_id)
        setCurrentConversationId(conversation.id)

        if (conversation.messages && conversation.messages.length > 0) {
          console.log('[CanvasChatPage] Loading messages:', conversation.messages.length)
          const loadedMessages = conversation.messages.map((m: any) => ({
            role: m.role,
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
      // 检查是否是 404 错误（会话不存在）
      if (err.message?.includes('404') || err.status === 404) {
        console.log('[CanvasChatPage] Conversation not found, treating as new conversation:', id)
        // 这是临时 ID 或不存在的会话，清空消息列表
        setMessages([])
        setCurrentConversationId(null)
      } else {
        console.error('[CanvasChatPage] Failed to load conversation:', err)
        setCurrentConversationId(id)
        setMessages([])
      }
    })
  }, [id, setCurrentConversationId, setMessages, setSelectedAgentId])

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

  // 解析"魔法修改"指令
  const handleMagicColor = useCallback((message: string) => {
    if (!message || typeof message !== 'string') return false

    const magicMatch = message.match(/把(.*?)改成?(.*?)(?:色|颜色)?/i)
    if (magicMatch && magicMatch[2]) {
      const color = magicMatch[2].trim()
      const colorMap: Record<string, string> = {
        '红': '#ef4444', '红色': '#ef4444',
        '蓝': '#3b82f6', '蓝色': '#3b82f6',
        '绿': '#22c55e', '绿色': '#22c55e',
        '黄': '#eab308', '黄色': '#eab308',
        '紫': '#8b5cf6', '紫色': '#8b5cf6',
        '粉': '#ec4899', '粉色': '#ec4899',
        '橙': '#f97316', '橙色': '#f97316'
      }

      if (colorMap[color]) {
        setMagicColor(colorMap[color])
        return true
      }
    }
    return false
  }, [setMagicColor])

  // 处理消息发送
  const handleSubmitMessage = useCallback(() => {
    if (!inputMessage || typeof inputMessage !== 'string' || !inputMessage.trim()) return

    if (handleMagicColor(inputMessage)) {
      return
    }

    setIsProcessing(true) // 开始处理，触发粒子汇聚动画
    handleSendMessage(inputMessage)

    // 2秒后恢复处理状态（模拟AI开始思考）
    setTimeout(() => setIsProcessing(false), 2000)
  }, [inputMessage, handleMagicColor, handleSendMessage])

  // 移动端右滑返回处理
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // 只在左侧 30px 区域内响应滑动
    const touchX = e.touches[0].clientX
    if (touchX < 30) {
      touchStartXRef.current = touchX
    } else {
      touchStartXRef.current = 0
    }
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchStartXRef.current > 0) {
      const currentX = e.touches[0].clientX
      const diff = currentX - touchStartXRef.current
      // 限制最大滑动距离
      if (diff > 0 && diff < 150) {
        setSwipeProgress(diff)
      }
    }
  }, [])

  const handleTouchEnd = useCallback(() => {
    if (swipeProgress > swipeThreshold) {
      // 触发返回首页
      navigate('/')
    }
    setSwipeProgress(0)
    touchStartXRef.current = 0
  }, [swipeProgress, navigate])

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
    />
  )

  // 创建画布内容组件
  const CanvasContent = (
    <InteractiveCanvas
      artifactType={artifactType}
      artifactContent={artifactContent}
      isProcessing={isProcessing}
    />
  )

  // 创建侧边栏内容
  const SidebarContent = (
    <Sidebar
      isCollapsed={false}
      currentPlan={user?.plan as 'Free' | 'Pilot' | 'Maestro'}
      onSettingsClick={handleSettingsClick}
      onPersonalSettingsClick={handlePersonalSettingsClick}
    />
  )

  return (
    <>
      <div
        className="w-full h-full"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <XPouchLayout
          SidebarContent={SidebarContent}
          CanvasContent={CanvasContent}
          ChatContent={ChatContent}
          isChatMinimized={isChatMinimized}
          setIsChatMinimized={setIsChatMinimized}
          swipeProgress={swipeProgress}
        />
      </div>

      {/* 设置对话框 */}
      <SettingsDialog
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      {/* 个人设置对话框 */}
      <PersonalSettingsDialog
        isOpen={isPersonalSettingsOpen}
        onClose={() => setIsPersonalSettingsOpen(false)}
      />

      {/* 抽屉式专家详情 */}
      <ExpertDrawer
        isOpen={isExpertDrawerOpen}
        onClose={() => setIsExpertDrawerOpen(false)}
        expertName={selectedExpert || '专家'}
      />
    </>
  )
}
