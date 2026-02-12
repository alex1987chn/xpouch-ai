import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom'
import { useChatStore } from '@/store/chatStore'
import { useTaskStore } from '@/store/taskStore'
import { useChat } from '@/hooks/useChat'
import { useSessionRecovery } from '@/hooks/chat/useSessionRecovery'
import { useApp } from '@/providers/AppProvider'

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

  // 加载自定义 Agent 的状态
  const [loadedAgent, setLoadedAgent] = useState<any>(null)
  const [isLoadingAgent, setIsLoadingAgent] = useState(false)

  // 异步加载自定义 Agent
  useEffect(() => {
    if (normalizedAgentId === SYSTEM_AGENTS.DEFAULT_CHAT) return
    
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
        const agent = agents.find((a: any) => a.id === normalizedAgentId)
        if (agent) {
          const formattedAgent = {
            id: agent.id,
            name: agent.name,
            description: agent.description || '',
            category: agent.category || '综合',
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
  }, [normalizedAgentId])

  // 计算当前智能体 (SDUI: 直接从 URL 获取 agentId，不依赖 Store)
  const currentAgent = useMemo(() => {
    // 优先使用 URL 中的 agentId (真相源)
    const effectiveAgentId = normalizedAgentId
    
    if (effectiveAgentId === SYSTEM_AGENTS.DEFAULT_CHAT) {
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
  }, [])

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
      console.log('[UnifiedChatPage] 执行中，跳过加载')
      return
    }

    // 🔥🔥🔥 简化判断：只检查会话和消息是否已加载
    // tasks 的恢复由 loadConversation 内部处理
    const storeCurrentId = useChatStore.getState().currentConversationId
    const currentMessages = useChatStore.getState().messages
    
    // 是否需要重新加载（会话不匹配或消息未加载）
    if (storeCurrentId === conversationId && currentMessages.length > 0) {
      // 已加载，跳过
      return
    }

    logger.debug('[UnifiedChatPage] 需要加载会话:', {
      storeCurrentId,
      conversationId,
      messagesCount: currentMessages.length
    })

    // 加载历史会话（仅从历史记录进入的场景）
    loadConversation(conversationId)
      .catch((error: any) => {
        if (error?.status === 404) {
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

  // 加载中状态：agent 正在从后端获取
  if (isLoadingAgent) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-6 h-6 border-2 border-[var(--border-color)] border-t-[var(--accent)] animate-spin mx-auto mb-2" />
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
          <p className="font-mono text-xs text-[var(--text-secondary)] mt-1">
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
