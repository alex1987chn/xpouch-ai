import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom'
import { useChatStore } from '@/store/chatStore'
import { useTaskStore } from '@/store/taskStore'
import { useChat } from '@/hooks/useChat'
import { useApp } from '@/providers/AppProvider'
import { getConversation } from '@/services/chat'
import { logger } from '@/utils/logger'

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
      // 如果是新会话，清空消息和任务状态
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

      // 延迟清除 location.state，避免影响后续逻辑
      setTimeout(() => {
        navigate(`/chat/${conversationId}${searchParams.toString() ? '?' + searchParams.toString() : ''}`, {
          replace: true,
          state: {}
        })
      }, 0)
    }, 300) // 延迟 300ms，足够绕过 Strict Mode 的抖动

    // 清理函数：如果组件在 300ms 内被卸载（严格模式的第一次卸载），取消定时器
    return () => {
      clearTimeout(timer)
    }
  }, [initialMessage, conversationId, normalizedAgentId, sendMessage, navigate, searchParams, isStreaming])

  // ============================================
  // v3.0: 状态恢复/水合 (State Rehydration)
  // 根据 Gemini 建议：页面切换后恢复任务状态
  // ============================================
  const isRecoveryInProgressRef = useRef(false)
  const lastRecoveryTimeRef = useRef(0)
  // v3.0: 标记是否有活跃的 SSE 连接（防止页面切换时重复触发）
  const hasActiveStreamRef = useRef(false)
  
  useEffect(() => {
    // 只在复杂模式下且当前有任务会话时才需要恢复
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        // v3.0: 如果有活跃的 SSE 连接，不要做任何恢复操作
        if (hasActiveStreamRef.current) {
          logger.debug('[SessionRecovery] 有活跃的 SSE 连接，跳过恢复')
          return
        }
        
        // 防抖：5 秒内不重复恢复
        const now = Date.now()
        if (now - lastRecoveryTimeRef.current < 5000) {
          return
        }
        
        // 检查是否需要恢复
        const taskStore = useTaskStore.getState()
        const chatStore = useChatStore.getState()
        
        // 如果有正在进行的 SSE 连接，不需要恢复
        if (chatStore.isGenerating) {
          logger.debug('[SessionRecovery] 正在生成中，跳过恢复')
          hasActiveStreamRef.current = true
          return
        }
        
        // 如果没有会话 ID，不需要恢复
        if (!conversationId) {
          return
        }
        
        // 如果已经有初始化的任务且没有运行中的任务，不需要恢复
        if (taskStore.isInitialized && taskStore.runningTaskIds.size === 0) {
          return
        }
        
        // 开始恢复
        isRecoveryInProgressRef.current = true
        lastRecoveryTimeRef.current = now
        
        try {
          logger.debug('[SessionRecovery] 页面重新可见，开始状态恢复')
          
          // 1. 拉取最新会话状态
          const conversation = await getConversation(conversationId)
          
          // 2. 检查是否有任务会话
          if (conversation.task_session && conversation.task_session.sub_tasks) {
            const { task_session } = conversation
            const subTasks = task_session.sub_tasks || []
            
            // 3. 恢复任务状态到 Store
            taskStore.restoreFromSession(task_session, subTasks)
            
            // 4. 检查是否还有运行中的任务
            const hasRunningTask = subTasks.some(t => t.status === 'running')
            
            logger.debug('[SessionRecovery] 状态恢复完成:', {
              taskCount: subTasks.length,
              hasRunningTask,
              sessionStatus: task_session.status
            })
            
            // 5. 如果有运行中的任务，提示用户任务仍在进行
            // 注意：由于 SSE 连接已断开，我们无法自动恢复流式输出
            // 用户需要等待任务完成或刷新页面查看最新结果
            if (hasRunningTask) {
              logger.debug('[SessionRecovery] 检测到运行中的任务，建议用户等待或刷新')
            }
          }
        } catch (error) {
          logger.error('[SessionRecovery] 状态恢复失败:', error)
        } finally {
          isRecoveryInProgressRef.current = false
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [conversationId])

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
            messages={messages}
            isGenerating={isStreaming}
            conversationMode={conversationMode}
            inputValue={inputValue}
            onInputChange={setInputValue}
            onSend={handleSend}
            onStop={stopGeneration}
            onRegenerate={() => retry()}
            onPreview={() => setViewMode('preview')}
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
