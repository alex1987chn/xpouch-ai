import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useTranslation } from '@/i18n'
import { useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useChatStore } from '@/store/chatStore'
import { useTaskStore } from '@/store/taskStore'
import { useUserStore } from '@/store/userStore'
import { useChat } from '@/hooks/useChat'
import { useSessionRestore } from '@/hooks/useSessionRestore'
import { useRunPolling } from '@/hooks/useRunPolling'
import { useChatSessionHandoff, usePendingMessageRetry } from '@/hooks/chat/useChatSession'
import { useAppUISelectors, useAgentsQuery } from '@/hooks'
import { chatHistoryKeys } from '@/hooks/queries'

import { SYSTEM_AGENTS, getSystemAgentName } from '@/constants/agents'
import { normalizeAgentId } from '@/utils/agentUtils'
import { logger } from '@/utils/logger'

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
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { id: pathThreadId } = useParams()
  const [searchParams] = useSearchParams()
  const { sidebar } = useAppUISelectors()

  const threadId = pathThreadId || ''
  const agentId = searchParams.get('agentId') || 'default-chat'
  const normalizedAgentId = normalizeAgentId(agentId)
  type ChatRouteState = { isNew?: boolean; startWith?: string }
  const routeState = (location.state as ChatRouteState | null) ?? null
  const initialMessage = routeState?.startWith
  
  // 🔥 提前定义 isNewConversation，供后续 useEffect 使用
  const isNewConversation = routeState?.isNew ?? false

  const queryClient = useQueryClient()

  const {
    isStreaming,
    sendMessage,
    stopGeneration,
    regenerate,  // 🔥 用于重新生成指定 AI 消息的回复
    resumeExecution  // 🔥🔥🔥 v3.1.0 HITL
  } = useChat()

  // 获取登录状态
  const isAuthenticated = useUserStore(state => state.isAuthenticated)

  // threadId 变化时清空残留消息/任务（会话内容由服务端恢复，见 useSessionRestore）
  useEffect(() => {
    useChatStore.getState().setMessages([])
    useTaskStore.getState().resetAll()
  }, [threadId])

  // 加载自定义 Agent（唯一真相：React Query 缓存，30 分钟内不重复请求）
  const { data: allAgents, isLoading: isLoadingAgent } = useAgentsQuery({
    enabled: isAuthenticated && normalizedAgentId !== SYSTEM_AGENTS.DEFAULT_CHAT,
  })
  const loadedAgent = useMemo(() => {
    if (normalizedAgentId === SYSTEM_AGENTS.DEFAULT_CHAT) return null
    const agent = allAgents?.find(a => a.id === normalizedAgentId)
    if (!agent) return null
    return {
      id: agent.id,
      name: agent.name,
      description: agent.description || '',
      category: agent.category || t('general'),
      isCustom: true,
      is_builtin: false,
      modelId: agent.model_id || 'deepseek-flash',
      icon: 'bot',
      systemPrompt: agent.system_prompt || '',
    }
  }, [allAgents, normalizedAgentId, t])

  // 计算当前智能体 (SDUI: 直接从 URL 获取 agentId，不依赖 Store)
  const currentAgent = useMemo(() => {
    if (normalizedAgentId === SYSTEM_AGENTS.DEFAULT_CHAT) {
      // 返回简化对象，仅用于存在性检查
      return {
        id: SYSTEM_AGENTS.DEFAULT_CHAT,
        name: getSystemAgentName(SYSTEM_AGENTS.DEFAULT_CHAT),
      }
    }

    // 从 Query 缓存派生的 loadedAgent（等待异步加载时为 null）
    return loadedAgent
  }, [normalizedAgentId, loadedAgent])

  const [isFullscreen, setIsFullscreen] = useState(false)
  const [viewMode, setViewMode] = useState<'chat' | 'preview'>('chat')
  const [inputValue, setInputValue] = useState('')

  // 同步会话 ID 到 store（仅用于 API 调用）
  useEffect(() => {
    if (threadId) {
      const currentId = useChatStore.getState().currentConversationId
      if (currentId !== threadId) {
        useChatStore.getState().setCurrentConversationId(threadId)
      }
    }
  }, [threadId])

  // 🔥🔥🔥 Server-Driven UI: 会话加载的前置守卫
  // 真正的历史加载统一由 useSessionRestore 处理（v3.4.4 删除了此处的
  // no-op 标记机器——原 effect 除设置自身 flag 外无任何副作用）
  useEffect(() => {
    if (!threadId) {
      // 无会话 ID 时重置状态
      useTaskStore.getState().resetAll()
      return
    }

    // 新会话（有 initialMessage）：跳过加载，会话在发送消息时创建
    if (initialMessage) {
      return
    }

    // 检查是否正在执行
    const { runningTaskIds, hasRunningTasks } = useTaskStore.getState()
    const isTaskStoreExecuting = hasRunningTasks ? hasRunningTasks() : runningTaskIds.size > 0

    // 执行中不加载（避免干扰流式输出）
    if (isTaskStoreExecuting) {
      return
    }
    // 其余路径无需动作：恢复由 useSessionRestore 的 enabled 条件驱动
  }, [threadId, initialMessage])

  // 恢复草稿（只依赖 threadId）
  useEffect(() => {
    if (!threadId) {
      const draft = localStorage.getItem('xpouch_chat_draft')
      if (draft && !inputValue) {
        setInputValue(draft)
        localStorage.removeItem('xpouch_chat_draft')
      }
    }
  }, [threadId, inputValue])

  // 处理首页传来的消息（新建会话）
  // 👈 使用 ref 锁住初始消息，确保只发送一次
  const hasSentInitialMessage = useRef(false)

  useEffect(() => {
    // 基础检查
    if (!initialMessage || hasSentInitialMessage.current || isStreaming) {
      return
    }

    // 使用 setTimeout 延迟执行，绕过 React 严格模式的抖动
    const timer = setTimeout(() => {
      // 双重检查：防止在 timeout 等待期间状态发生变化
      if (hasSentInitialMessage.current) return

      // 标记为已发送
      hasSentInitialMessage.current = true

      // 发送消息
      sendMessage(initialMessage, normalizedAgentId)
        .then(() => {
          // 🔥 刷新会话列表，让首页能看到新创建的会话
          queryClient.invalidateQueries({ queryKey: chatHistoryKeys.lists() })
        })
        .catch(err => logger.error('[UnifiedChatPage] 发送消息失败:', err))

      // 🔥 修复：使用 isNew: false 标记会话已创建，避免 useSessionRestore 404 错误
      setTimeout(() => {
        navigate(`/chat/${threadId}${searchParams.toString() ? '?' + searchParams.toString() : ''}`, {
          replace: true,
          state: { isNew: false }
        })
      }, 0)
    }, 300) // 延迟 300ms，足够绕过 Strict Mode 的抖动

    // 清理函数：如果组件在 300ms 内被卸载（严格模式的第一次卸载），取消定时器
    return () => {
      clearTimeout(timer)
    }
  }, [initialMessage, threadId, normalizedAgentId, sendMessage, navigate, searchParams, isStreaming, queryClient])

  // v3.0: 状态恢复/水合（使用独立的 Hook）
  // v3.5.0: 解耦 useSessionRestore 和 useRunPolling，组件层组合
  // 🔥 useSessionRestore 仅负责恢复会话数据
  const { isRestored, isLatestRunControllable, latestRunId, restore: restoreSession } = useSessionRestore({ enabled: !!threadId && !isNewConversation })

  // 🔥 useRunPolling 独立运行，负责轮询状态
  const { startPolling, stopPolling, isPolling, currentStatus: pollingStatus, isHITLPaused, isTerminal, hasError } = useRunPolling({ enabled: true })

  // 🔥 从 store 获取 activeRunId（用于监听）
  const activeRunId = useTaskStore((state) => state.activeRunId)

  // 🔥 v3.5.1 修复：包装 stopGeneration，同时停止轮询
  const handleStopGeneration = useCallback(() => {
    stopPolling()  // 先停止轮询
    stopGeneration()  // 再停止生成
  }, [stopPolling, stopGeneration])

  // 🔥 会话生命周期编排（恢复→轮询交接 / 终态单次刷新 / 登录后重发）
  // v3.4.4 纯搬入 hooks/chat/useChatSession.ts，逻辑不变
  const { resetTerminalRefresh } = useChatSessionHandoff({
    threadId,
    isRestored,
    isLatestRunControllable,
    latestRunId,
    activeRunId,
    isTerminal,
    startPolling,
    stopPolling,
    restoreSession,
  })
  usePendingMessageRetry(sendMessage, normalizedAgentId, isStreaming)

  // 发送消息处理
  const handleSend = useCallback(() => {
    if (!inputValue.trim() || isStreaming) return
    sendMessage(inputValue, normalizedAgentId)
      .then(() => {
        // 🔥 刷新会话列表，确保首页能看到最新会话
        queryClient.invalidateQueries({ queryKey: chatHistoryKeys.lists() })
      })
    setInputValue('')
  }, [inputValue, isStreaming, sendMessage, normalizedAgentId, queryClient])

  // 缓存回调函数，避免 ChatStreamPanel 不必要的重渲染
  const handleInputChange = useCallback((value: string) => {
    setInputValue(value)
  }, [setInputValue])

  // 🔥 修复：使用 regenerate 而不是 retry，避免重复发送用户消息
  const handleRegenerate = useCallback((messageId: string | number) => {
    regenerate(messageId)
  }, [regenerate])

  // 缓存全屏切换回调
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => !prev)
  }, [])

  const chatStreamInput = useMemo(
    () => ({
      value: inputValue,
      onChange: handleInputChange,
    }),
    [inputValue, handleInputChange]
  )

  const chatStreamActions = useMemo(
    () => ({
      onSend: handleSend,
      onStop: handleStopGeneration,  // 🔥 v3.5.1 使用包装函数
      onRegenerate: handleRegenerate,
    }),
    [handleSend, handleStopGeneration, handleRegenerate]
  )

  // v3.4.0: 轮询状态（用于恢复运行中的任务）
  // 🔥 v3.5.1 修复：手动刷新时强制恢复，跳过防抖
  const handleRefreshSession = useCallback(() => {
    resetTerminalRefresh()
    restoreSession()
  }, [resetTerminalRefresh, restoreSession])

  const chatStreamPolling = useMemo(
    () => ({
      isPolling,
      status: pollingStatus,
      isHITLPaused,
      hasError,
      onRefresh: handleRefreshSession,
    }),
    [isPolling, pollingStatus, isHITLPaused, hasError, handleRefreshSession]
  )

  // 加载中状态：agent 正在从后端获取
  if (isLoadingAgent) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-6 h-6 border-2 border-border border-t-accent-brand animate-spin mx-auto mb-2" />
          <p className="font-mono text-sm">Loading agent...</p>
        </div>
      </div>
    )
  }

  // URL 有 agentId 但加载失败（agent 不存在或已被删除）
  if (!currentAgent && normalizedAgentId !== SYSTEM_AGENTS.DEFAULT_CHAT) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="font-mono text-sm text-status-offline">Agent not found</p>
          <p className="font-mono text-xs text-content-secondary mt-1">
            ID: {normalizedAgentId}
          </p>
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
            input={chatStreamInput}
            actions={chatStreamActions}
            resumeExecution={resumeExecution}  // 🔥🔥🔥 v3.1.0 HITL
            polling={chatStreamPolling}  // 🔥 v3.4.0 轮询状态
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
