import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom'
import { useChatStore } from '@/store/chatStore'
import { useTaskStore } from '@/store/taskStore'
import { useExecutionStore } from '@/store/executionStore'
import { useChat } from '@/hooks/useChat'
import { useSessionRecovery } from '@/hooks/chat/useSessionRecovery'
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
    isStreaming,
    sendMessage,
    stopGeneration,
    loadConversation,
    retry,
    resumeExecution  // 🔥🔥🔥 v3.1.0 HITL
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

  // 🔥🔥🔥 Server-Driven UI: 简化会话加载逻辑
  // 依赖：key={id} 强制重新挂载 + 导航时清空 Store
  useEffect(() => {
    if (!conversationId) {
      // 无会话 ID 时重置状态
      useTaskStore.getState().clearTasks()
      useExecutionStore.getState().reset()
      return
    }

    // 检查是否正在执行（同时检查 TaskStore 和 ExecutionStore）
    const { runningTaskIds, hasRunningTasks } = useTaskStore.getState()
    const isTaskStoreExecuting = hasRunningTasks ? hasRunningTasks() : runningTaskIds.size > 0
    const executionStatus = useExecutionStore.getState().status
    const isExecutionStoreActive = executionStatus === 'executing' || executionStatus === 'planning'
    const isExecuting = isTaskStoreExecuting || isExecutionStoreActive
    
    // 执行中不加载（避免干扰流式输出）
    if (isExecuting) {
      console.log('[UnifiedChatPage] 执行中，跳过加载')
      return
    }

    // 检查是否已加载当前会话
    const storeCurrentId = useChatStore.getState().currentConversationId
    const currentMessages = useChatStore.getState().messages
    
    if (storeCurrentId === conversationId && currentMessages.length > 0) {
      // 已加载，跳过
      return
    }

    // 加载历史会话
    loadConversation(conversationId)
      .catch((error: any) => {
        if (error?.status === 404) {
          // 会话不存在，重置状态
          useChatStore.getState().setMessages([])
          useTaskStore.getState().clearTasks()
          useExecutionStore.getState().reset()
        }
      })
  }, [conversationId])

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
  // 👈 使用 ref 锁住初始消息，确保只发送一次
  const hasSentInitialMessage = useRef(false)

  useEffect(() => {
    // 基础检查
    if (!initialMessage || hasSentInitialMessage.current || isStreaming) {
      return
    }

    // 🚀 核心修复：使用 setTimeout 延迟执行
    // 这样做的目的是：在 React 严格模式的 "Mount -> Unmount" 瞬间，
    // 这里的 timer 会被下面的 cleanup 清除，从而根本不会发出那个注定要被 Abort 的请求。
    // 只有第二次稳定的 Mount，timer 才会真正跑完并发送请求。
    const timer = setTimeout(() => {
      // 双重检查：防止在 timeout 等待期间状态发生变化
      if (hasSentInitialMessage.current) return

      console.log('[UnifiedChatPage] 准备发送首页传来的消息 (Delayed):', initialMessage.substring(0, 50))

      // 标记为已发送
      hasSentInitialMessage.current = true

      // 发送消息
      sendMessage(initialMessage, normalizedAgentId)
        .catch(err => console.error('[UnifiedChatPage] 发送消息失败:', err))

      // 🔥 修复：使用 isNew: false 标记会话已创建，避免触发 loadConversation 404 错误
      setTimeout(() => {
        navigate(`/chat/${conversationId}${searchParams.toString() ? '?' + searchParams.toString() : ''}`, {
          replace: true,
          state: { isNew: false }
        })
      }, 0)
    }, 300) // 延迟 300ms，足够绕过 Strict Mode 的抖动

    // 清理函数：如果组件在 300ms 内被卸载（严格模式的第一次卸载），取消定时器
    return () => {
      clearTimeout(timer)
    }
  }, [initialMessage, conversationId, normalizedAgentId, sendMessage, navigate, searchParams, isStreaming])

  // v3.0: 状态恢复/水合（使用独立的 Hook）
  useSessionRecovery(conversationId)

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
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

      <IndustrialChatLayout
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        isFullscreen={isFullscreen}
        chatStreamPanel={
          <ChatStreamPanel
            inputValue={inputValue}
            onInputChange={setInputValue}
            onSend={handleSend}
            onStop={stopGeneration}
            onRegenerate={() => retry()}
            onPreview={() => setViewMode('preview')}
            resumeExecution={resumeExecution}  // 🔥🔥🔥 v3.1.0 HITL
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
