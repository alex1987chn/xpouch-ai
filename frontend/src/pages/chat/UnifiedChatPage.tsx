import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom'
import { useCanvasStore } from '@/store/canvasStore'
import { useChatStore } from '@/store/chatStore'
import { useChat } from '@/hooks/useChat'
import { useApp } from '@/providers/AppProvider'

import { SYSTEM_AGENTS, getSystemAgentName } from '@/constants/agents'
import { normalizeAgentId } from '@/utils/agentUtils'

// 新布局组件
import { IndustrialChatLayout, ChatStreamPanel } from '@/components/layout'
import OrchestratorPanelV2 from '@/components/layout/OrchestratorPanelV2'
import { IndustrialHeader } from '@/components/chat/IndustrialHeader'

import type { Artifact } from '@/types'

/**
 * =============================
 * 统一聊天页面 (UnifiedChatPage) v3.0
 * =============================
 *
 * [设计理念] Server-Driven UI (电影院模式)
 * - 后端是放映机和胶卷：LangGraph 状态机 + 数据库存储
 * - 前端是银幕：只负责展示后端推送的状态
 */
export default function UnifiedChatPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { id: pathConversationId } = useParams()
  const [searchParams] = useSearchParams()
  const { sidebar } = useApp()

  const conversationId = pathConversationId || ''
  const agentId = searchParams.get('agentId') || 'default-chat'
  const normalizedAgentId = normalizeAgentId(agentId)
  const isNewConversation = (location.state as { isNew?: boolean })?.isNew === true
  const initialMessage = (location.state as { startWith?: string })?.startWith

  const {
    messages,
    isStreaming,
    conversationMode,
    sendMessage,
    stopGeneration,
    loadConversation,
    retry
  } = useChat()

  // 使用 ref 标记初始化状态，防止无限循环
  const initializedRef = useRef(false)
  const conversationLoadedRef = useRef(false)

  // 计算当前智能体
  const currentAgent = useMemo(() => {
    const selectedAgentId = useChatStore.getState().selectedAgentId
    if (selectedAgentId === SYSTEM_AGENTS.DEFAULT_CHAT) {
      return {
        id: SYSTEM_AGENTS.DEFAULT_CHAT,
        name: getSystemAgentName(SYSTEM_AGENTS.DEFAULT_CHAT),
        description: '日常对话、通用任务、智能问答',
        category: '通用',
        isCustom: false,
        is_builtin: false,
        modelId: 'deepseek-chat',
        icon: null,
        systemPrompt: ''
      }
    } else {
      const customAgents = useChatStore.getState().customAgents
      return customAgents.find(a => a.id === selectedAgentId)
    }
  }, [])

  const {
    artifactSessions,
    selectedExpertSession,
    selectArtifactSession,
    switchArtifactIndex,
    clearExpertResults,
    clearArtifactSessions,
    expertResults
  } = useCanvasStore()

  const [isFullscreen, setIsFullscreen] = useState(false)
  const [viewMode, setViewMode] = useState<'chat' | 'preview'>('chat')
  const [inputValue, setInputValue] = useState('')

  // 移动端：检测到专家活动时，自动切换到 preview 模式
  const hasExpertActivity = expertResults.length > 0 || Object.keys(artifactSessions).length > 0
  
  useEffect(() => {
    if (hasExpertActivity && viewMode === 'chat') {
      setViewMode('preview')
    }
  }, [hasExpertActivity])

  // 同步 URL 的 agentId 到 store（只执行一次）
  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true

    if (conversationId) {
      const currentId = useChatStore.getState().currentConversationId
      if (currentId !== conversationId) {
        useChatStore.getState().setCurrentConversationId(conversationId)
      }
    }

    const selectedAgentId = useChatStore.getState().selectedAgentId
    if (normalizedAgentId && normalizedAgentId !== selectedAgentId) {
      useChatStore.getState().setSelectedAgentId(normalizedAgentId)
    }
  }, [])

  // 加载历史会话（只执行一次）
  useEffect(() => {
    if (conversationLoadedRef.current) return
    conversationLoadedRef.current = true

    if (conversationId) {
      if (isNewConversation) {
        useChatStore.getState().setCurrentConversationId(conversationId)
        useChatStore.getState().setMessages([])
        clearExpertResults()
        clearArtifactSessions()
        return
      }

      const storeCurrentId = useChatStore.getState().currentConversationId
      const isSwitchingConversation = storeCurrentId !== conversationId
      
      if (isSwitchingConversation) {
        useChatStore.getState().setMessages([])
      }

      loadConversation(conversationId)
        .catch((error: any) => {
          if (error?.status === 404 || error?.message?.includes('404')) {
            useChatStore.getState().setCurrentConversationId(conversationId)
            useChatStore.getState().setMessages([])
            clearExpertResults()
            clearArtifactSessions()
          }
        })
    } else {
      clearExpertResults()
      clearArtifactSessions()
    }
  }, [])

  // 恢复草稿（只依赖 conversationId）
  useEffect(() => {
    if (!conversationId) {
      const draft = localStorage.getItem('xpouch_chat_draft')
      if (draft && !inputValue) {
        setInputValue(draft)
        localStorage.removeItem('xpouch_chat_draft')
      }
    }
  }, [conversationId])

  // 处理首页传来的消息（新建会话）
  useEffect(() => {
    if (isNewConversation && initialMessage && !isStreaming && conversationId) {
      const timer = setTimeout(() => {
        sendMessage(initialMessage, normalizedAgentId)
        navigate(`/chat/${conversationId}${searchParams.toString() ? '?' + searchParams.toString() : ''}`, {
          replace: true,
          state: {}
        })
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [isNewConversation, initialMessage, isStreaming, conversationId])

  // 处理专家卡片点击
  const handleExpertClick = useCallback((expertId: string) => {
    useCanvasStore.getState().selectExpert(expertId)
    useCanvasStore.getState().selectArtifactSession(expertId)
  }, [])

  // 处理消息中的链接点击
  const handleLinkClick = useCallback((href: string) => {
    const expertId = href.replace('#', '')
    if (expertId) {
      useCanvasStore.getState().selectExpert(expertId)
      useCanvasStore.getState().selectArtifactSession(expertId)
    }
  }, [])

  // 发送消息处理
  const handleSend = useCallback(() => {
    if (!inputValue.trim() || isStreaming) return
    sendMessage(inputValue, normalizedAgentId)
    setInputValue('')
  }, [inputValue, isStreaming, sendMessage, normalizedAgentId])

  const selectedExpertId = selectedExpertSession

  // 处理 Artifact 点击
  const handleArtifactClick = useCallback((artifact: Artifact) => {
    const expertType = artifact.source || selectedExpertSession
    if (expertType) {
      selectArtifactSession(expertType)
    }
  }, [selectArtifactSession, selectedExpertSession])

  // 获取当前选中专家的 artifact session
  const currentArtifactSession = useMemo(() => {
    if (!selectedExpertSession) return null
    return artifactSessions.find(s => s.expertType === selectedExpertSession) || null
  }, [artifactSessions, selectedExpertSession])

  // 获取当前选中专家的所有 artifacts
  const currentExpertArtifacts = useMemo(() => {
    if (!currentArtifactSession) return []
    return currentArtifactSession.artifacts.map((artifact, idx) => ({
      ...artifact,
      _index: idx
    }))
  }, [currentArtifactSession])

  // 当前选中的 artifact
  const currentArtifact = useMemo(() => {
    if (!currentArtifactSession || currentArtifactSession.artifacts.length === 0) return null
    const currentIndex = currentArtifactSession.currentIndex
    if (currentIndex >= 0 && currentIndex < currentArtifactSession.artifacts.length) {
      return { ...currentArtifactSession.artifacts[currentIndex], _index: currentIndex }
    }
    return { ...currentArtifactSession.artifacts[0], _index: 0 }
  }, [currentArtifactSession])

  // 缓存全屏切换回调
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => !prev)
  }, [])

  if (!currentAgent) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="font-mono text-sm">Agent not found</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <IndustrialHeader
        onClose={() => navigate('/')}
        onMenuClick={sidebar.toggleMobile}
      />

      <IndustrialChatLayout
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        isFullscreen={isFullscreen}
        chatStreamPanel={
          <ChatStreamPanel
            messages={messages}
            isGenerating={isStreaming}
            conversationMode={conversationMode}
            inputValue={inputValue}
            onInputChange={setInputValue}
            onSend={handleSend}
            onStop={stopGeneration}
            activeExpert={selectedExpertId}
            onRegenerate={() => retry()}
            onLinkClick={handleLinkClick}
          />
        }
        orchestratorPanel={
          <OrchestratorPanelV2
            isFullscreen={isFullscreen}
            onToggleFullscreen={toggleFullscreen}
          />
        }
      />
    </div>
  )
}
