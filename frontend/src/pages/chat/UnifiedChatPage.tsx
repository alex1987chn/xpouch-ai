import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom'
import { useChatStore } from '@/store/chatStore'
import { useTaskStore } from '@/store/taskStore'
import { useChat } from '@/hooks/useChat'
import { useApp } from '@/providers/AppProvider'

import { SYSTEM_AGENTS, getSystemAgentName } from '@/constants/agents'
import { normalizeAgentId } from '@/utils/agentUtils'

// 新布局组件
import { IndustrialChatLayout, ChatStreamPanel } from '@/components/layout'
import OrchestratorPanelV2 from '@/components/layout/OrchestratorPanelV2'
import { IndustrialHeader } from '@/components/chat/IndustrialHeader'

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
  }, [normalizedAgentId])

  const [isFullscreen, setIsFullscreen] = useState(false)
  const [viewMode, setViewMode] = useState<'chat' | 'preview'>('chat')
  const [inputValue, setInputValue] = useState('')
  // TODO: 移动端专家活动检测需要 taskStore 提供类似能力
  // const hasExpertActivity = ...

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

  // 加载历史会话（conversationId 或 normalizedAgentId 改变时重新加载）
  useEffect(() => {
    if (conversationId) {
      if (isNewConversation) {
        useChatStore.getState().setCurrentConversationId(conversationId)
        useChatStore.getState().setMessages([])
        const { clearTasks, setMode } = useTaskStore.getState()
        clearTasks()
        setMode('simple')
        return
      }

      const storeCurrentId = useChatStore.getState().currentConversationId
      const storeAgentId = useChatStore.getState().selectedAgentId
      const isSwitchingConversation = storeCurrentId !== conversationId
      const isSwitchingAgent = storeAgentId !== normalizedAgentId

      // 如果切换了会话或智能体，先清空旧消息
      if (isSwitchingConversation || isSwitchingAgent) {
        useChatStore.getState().setMessages([])
      }

      loadConversation(conversationId)
        .catch((error: any) => {
          if (error?.status === 404 || error?.message?.includes('404')) {
            useChatStore.getState().setCurrentConversationId(conversationId)
            useChatStore.getState().setMessages([])
            const { clearTasks, setMode } = useTaskStore.getState()
            clearTasks()
            setMode('simple')
          }
        })
    } else {
      const { clearTasks, setMode } = useTaskStore.getState()
      clearTasks()
      setMode('simple')
    }
  }, [conversationId, normalizedAgentId, isNewConversation])

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

  // 发送消息处理
  const handleSend = useCallback(() => {
    if (!inputValue.trim() || isStreaming) return
    sendMessage(inputValue, normalizedAgentId)
    setInputValue('')
  }, [inputValue, isStreaming, sendMessage, normalizedAgentId])

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
            onRegenerate={() => retry()}
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
