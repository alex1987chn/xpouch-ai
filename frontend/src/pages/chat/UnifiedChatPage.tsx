import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useTranslation } from '@/i18n'
import { useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom'
import { useChatStore } from '@/store/chatStore'
import { useTaskStore } from '@/store/taskStore'
import { useUserStore } from '@/store/userStore'
import { useChat } from '@/hooks/useChat'
import { useSessionRestore } from '@/hooks/useSessionRestore'
import { useAppUISelectors } from '@/hooks'

import { SYSTEM_AGENTS, getSystemAgentName } from '@/constants/agents'
import { normalizeAgentId } from '@/utils/agentUtils'
import { getAllAgents } from '@/services/api'
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
  const { id: pathConversationId } = useParams()
  const [searchParams] = useSearchParams()
  const { sidebar } = useAppUISelectors()

  const conversationId = pathConversationId || ''
  const agentId = searchParams.get('agentId') || 'default-chat'
  const normalizedAgentId = normalizeAgentId(agentId)
  type ChatRouteState = { isNew?: boolean; startWith?: string }
  const routeState = (location.state as ChatRouteState | null) ?? null
  const initialMessage = routeState?.startWith

  const {
    isStreaming,
    sendMessage,
    stopGeneration,
    loadConversation,
    regenerate,  // 🔥 用于重新生成指定 AI 消息的回复
    resumeExecution  // 🔥🔥🔥 v3.1.0 HITL
  } = useChat()

  const conversationLoadedRef = useRef(false)
  const loadConversationRef = useRef(loadConversation)
  loadConversationRef.current = loadConversation
  
  // conversationId 变化时重置加载标记
  useEffect(() => {
    conversationLoadedRef.current = false
  }, [conversationId])

  // 加载自定义 Agent 的状态
  type LoadedAgent = {
    id: string
    name: string
    description: string
    category: string
    isCustom: boolean
    is_builtin: boolean
    modelId: string
    icon: null
    systemPrompt: string
  }
  const [loadedAgent, setLoadedAgent] = useState<LoadedAgent | null>(null)
  const [isLoadingAgent, setIsLoadingAgent] = useState(false)

  // 获取登录状态
  const isAuthenticated = useUserStore(state => state.isAuthenticated)

  // 异步加载自定义 Agent
  useEffect(() => {
    if (normalizedAgentId === SYSTEM_AGENTS.DEFAULT_CHAT) return
    
    // 未登录时不发起请求
    if (!isAuthenticated) return
    
    // 先在 store 中查找
    const customAgents = useChatStore.getState().customAgents
    const cachedAgent = customAgents.find(a => a.id === normalizedAgentId)
    if (cachedAgent) {
      setLoadedAgent(cachedAgent)
      return
    }
    
    // 如果 store 中没有，从后端加载
    const loadAgent = async () => {
      setIsLoadingAgent(true)
      try {
        const agents = await getAllAgents()
        const agent = agents.find((a: { id: string }) => a.id === normalizedAgentId)
        if (agent) {
          const formattedAgent = {
            id: agent.id,
            name: agent.name,
            description: agent.description || '',
            category: agent.category || t('general'),
            isCustom: true,
            is_builtin: false,
            modelId: agent.model_id || 'deepseek-chat',
            icon: null,
            systemPrompt: agent.system_prompt || ''
          }
          setLoadedAgent(formattedAgent)
          // 同时更新 store
          useChatStore.getState().setCustomAgents(prev => {
            if (prev.find(a => a.id === agent.id)) return prev
            return [...prev, formattedAgent]
          })
        }
      } catch (error) {
        logger.error('[UnifiedChatPage] 加载 Agent 失败:', error)
      } finally {
        setIsLoadingAgent(false)
      }
    }
    
    loadAgent()
  }, [normalizedAgentId, isAuthenticated, t])

  // 计算当前智能体 (SDUI: 直接从 URL 获取 agentId，不依赖 Store)
  const currentAgent = useMemo(() => {
    // 优先使用 URL 中的 agentId (真相源)
    const effectiveAgentId = normalizedAgentId
    
    if (effectiveAgentId === SYSTEM_AGENTS.DEFAULT_CHAT) {
      // 返回简化对象，仅用于存在性检查
      return {
        id: SYSTEM_AGENTS.DEFAULT_CHAT,
        name: getSystemAgentName(SYSTEM_AGENTS.DEFAULT_CHAT),
      }
    }
    
    // 优先使用从后端加载的 agent
    if (loadedAgent && loadedAgent.id === effectiveAgentId) {
      return loadedAgent
    }
    
    // 从 store 缓存中查找
    const customAgents = useChatStore.getState().customAgents
    const cachedAgent = customAgents.find(a => a.id === effectiveAgentId)
    if (cachedAgent) return cachedAgent
    
    // 如果都没有找到，返回 null (等待异步加载完成)
    return null
  }, [normalizedAgentId, loadedAgent])

  const [isFullscreen, setIsFullscreen] = useState(false)
  const [viewMode, setViewMode] = useState<'chat' | 'preview'>('chat')
  const [inputValue, setInputValue] = useState('')

  // 同步会话 ID 到 store（仅用于 API 调用）
  useEffect(() => {
    if (conversationId) {
      const currentId = useChatStore.getState().currentConversationId
      if (currentId !== conversationId) {
        useChatStore.getState().setCurrentConversationId(conversationId)
      }
    }
  }, [conversationId])

  // 🔥🔥🔥 Server-Driven UI: 简化会话加载逻辑
  // 依赖：key={id} 强制重新挂载 + 导航时清空 Store
  useEffect(() => {
    if (!conversationId) {
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

    // 🔥🔥🔥 简化判断：只检查会话和消息是否已加载
    // tasks 的恢复由 loadConversation 内部处理
    const storeCurrentId = useChatStore.getState().currentConversationId
    const currentMessages = useChatStore.getState().messages
    
    // 防止重复加载：使用 ref 标记
    if (conversationLoadedRef.current) {
      return
    }
    
    // 是否需要重新加载
    if (storeCurrentId === conversationId && currentMessages.length > 0) {
      // 已加载，跳过
      conversationLoadedRef.current = true
      return
    }
    
    // 检查是否已经有 tasks 数据（由 persist 恢复）
    const taskStore = useTaskStore.getState()
    if (taskStore.tasks.size > 0) {
      conversationLoadedRef.current = true
      return
    }

    // 标记为已加载，防止重复调用
    conversationLoadedRef.current = true

    // 加载历史会话（仅从历史记录进入的场景）
    loadConversationRef.current(conversationId)
      .catch((error: unknown) => {
        const status = (typeof error === 'object' && error !== null && 'status' in error)
          ? (error as { status?: number }).status
          : undefined
        if (status === 404) {
          // 会话不存在，重置状态
          useChatStore.getState().setMessages([])
          useTaskStore.getState().resetAll()
        }
      })
  }, [conversationId, initialMessage])

  // 恢复草稿（只依赖 conversationId）
  useEffect(() => {
    if (!conversationId) {
      const draft = localStorage.getItem('xpouch_chat_draft')
      if (draft && !inputValue) {
        setInputValue(draft)
        localStorage.removeItem('xpouch_chat_draft')
      }
    }
  }, [conversationId, inputValue])

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
        .catch(err => logger.error('[UnifiedChatPage] 发送消息失败:', err))

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
  // v3.3.0: 使用合并后的 useSessionRestore，同时支持页面加载恢复和标签页切换恢复
  // 🔥 始终启用 useSessionRestore，它会内部处理重复恢复
  useSessionRestore({ enabled: !!conversationId })

  // 🔐 登录后自动重发消息（Store Trigger 模式）
  // 使用 ref 存储最新的 sendMessage 函数，避免 subscribe 闭包问题
  const sendMessageRef = useRef(sendMessage)
  sendMessageRef.current = sendMessage
  
  const normalizedAgentIdRef = useRef(normalizedAgentId)
  normalizedAgentIdRef.current = normalizedAgentId
  
  useEffect(() => {
    // 订阅 Store 变化
    const unsubscribe = useChatStore.subscribe((state, prevState) => {
      // 当 shouldRetrySend 从 false 变为 true 时触发
      if (state.shouldRetrySend && !prevState.shouldRetrySend && state.pendingMessage && !isStreaming) {
        // 使用 ref 获取最新的函数，避免闭包问题
        const currentSendMessage = sendMessageRef.current
        const currentAgentId = normalizedAgentIdRef.current
        
        // 发送消息
        currentSendMessage(state.pendingMessage, currentAgentId)
          .then(() => {
            // 发送成功，清空待发送消息和标志
            useChatStore.getState().setPendingMessage(null)
            useChatStore.getState().setShouldRetrySend(false)
          })
          .catch((err) => {
            logger.error('[UnifiedChatPage] 消息重发失败:', err)
            // 清除标志，允许下次重试
            useChatStore.getState().setShouldRetrySend(false)
            // 如果还是 401，会再次触发登录弹窗，pendingMessage 保留
          })
      }
    })
    
    return () => unsubscribe()
  }, [isStreaming]) // 只依赖 isStreaming，其他使用 ref

  // 发送消息处理
  const handleSend = useCallback(() => {
    if (!inputValue.trim() || isStreaming) return
    sendMessage(inputValue, normalizedAgentId)
    setInputValue('')
  }, [inputValue, isStreaming, sendMessage, normalizedAgentId])

  // 缓存回调函数，避免 ChatStreamPanel 不必要的重渲染
  const handleInputChange = useCallback((value: string) => {
    setInputValue(value)
  }, [setInputValue])

  // 🔥 修复：使用 regenerate 而不是 retry，避免重复发送用户消息
  const handleRegenerate = useCallback((messageId: string | number) => {
    regenerate(messageId)
  }, [regenerate])

  const handlePreview = useCallback(() => {
    setViewMode('preview')
  }, [setViewMode])

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
      onStop: stopGeneration,
      onRegenerate: handleRegenerate,
      onPreview: handlePreview,
    }),
    [handleSend, stopGeneration, handleRegenerate, handlePreview]
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
          <p className="font-mono text-sm text-red-500">Agent not found</p>
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
