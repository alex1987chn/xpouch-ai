import { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom'
import { useCanvasStore } from '@/store/canvasStore'
import { useChatStore } from '@/store/chatStore'
import { useChat } from '@/hooks/useChat'
import { useApp } from '@/providers/AppProvider'

import { SYSTEM_AGENTS, getSystemAgentName } from '@/constants/agents'
import { getConversationMode, normalizeAgentId } from '@/utils/agentUtils'
import { logger } from '@/utils/logger'

// 开发环境判断
const DEBUG = import.meta.env.VITE_DEBUG_MODE === 'true'

// 统一的调试日志函数
const debug = DEBUG
  ? (...args: unknown[]) => console.log('[UnifiedChatPage]', ...args)
  : () => {}

// 新布局组件
import { IndustrialChatLayout, ChatStreamPanel, OrchestratorPanel } from '@/components/layout'
// 工业风格头部
import { IndustrialHeader } from '@/components/chat/IndustrialHeader'

import type { Artifact } from '@/types'


/**
 * =============================
 * 统一聊天页面 (UnifiedChatPage)
 * =============================
 *
 * [架构层级] Layer 3 - 页面组件
 *
 * [功能描述]
 * 支持两种模式的统一聊天页面：
 * - 简单模式 (simple)：默认助手/自定义智能体，直连 LLM
 * - 复杂模式 (complex)：AI 助手，通过 LangGraph 专家协作系统
 *
 * [核心特性]
 * 1. 消息流管理：发送/接收/重试
 * 2. Artifact 展示：代码/文档/HTML/搜索/文本
 * 3. 专家协作：专家状态栏 + 专家预览
 * 4. 模式切换：简单 ↔ 复杂模式
 * 5. 移动端适配：Chat/Preview 双视图
 *
 * [布局结构]
 * - IndustrialChatLayout (双栏布局)
 *   - ChatStreamPanel (左侧 55%): 消息列表 + 输入控制台
 *   - OrchestratorPanel (右侧 45%): 专家状态栏 + Artifacts
 *
 * [路由设计]
 * - 默认助手: `/chat/:id` (纯净 URL，后端自动使用 sys-default-chat)
 * - 自定义智能体: `/chat/:id?agentId=xxx`
 * - 复杂模式: `/chat/:id?agentId=sys-task-orchestrator`
 * - 支持简单模式和复杂模式，通过 agentId 区分
 *
 * [状态管理]
 * - useChat: 消息流逻辑
 * - useCanvasStore: 专家结果 + Artifact 会话
 * - useChatStore: 当前智能体 + 自定义智能体
 */
export default function UnifiedChatPage() {

  const navigate = useNavigate()
  const location = useLocation()
  const { id: pathConversationId } = useParams()
  const [searchParams] = useSearchParams()
  const { sidebar } = useApp()

  // URL 格式：/chat/:id?agentId=xxx（可选）
  const conversationId = pathConversationId || ''
  const agentId = searchParams.get('agentId') || 'default-chat'
  const normalizedAgentId = normalizeAgentId(agentId)
  // 👈 从 state 中获取 isNew 标记，而不是查询参数
  const isNewConversation = (location.state as { isNew?: boolean })?.isNew === true
  const initialMessage = (location.state as { startWith?: string })?.startWith

  // 移除模式判断，后端自动处理路由决策


  const {
    messages,
    isStreaming,
    isLoading,
    sendMessage,
    stopGeneration,
    loadConversation,
    retry
  } = useChat()

  const setSelectedAgentId = useChatStore(state => state.setSelectedAgentId)
  const selectedAgentId = useChatStore(state => state.selectedAgentId)
  const customAgents = useChatStore(state => state.customAgents)
  const setCurrentConversationId = useChatStore(state => state.setCurrentConversationId)
  const setMessages = useChatStore(state => state.setMessages)
  
  // 计算当前智能体，避免 getCurrentAgent() 每次返回新对象
  // 👈 所有对话都使用默认助手，复杂模式是后端内部状态
  const currentAgent = useMemo(() => {
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
      // 自定义智能体
      return customAgents.find(a => a.id === selectedAgentId)
    }
  }, [selectedAgentId, customAgents])

  // TODO: 从后端获取 thread_mode 来判断是否显示复杂模式 UI
  // const threadMode = thread?.thread_mode // 'simple' | 'complex'
  // const isComplexMode = threadMode === 'complex'

  const {
    artifactSessions,
    selectedExpertSession,
    selectArtifactSession,
    switchArtifactIndex,
    clearArtifactSessions,
    expertResults,
    clearExpertResults
  } = useCanvasStore()


  const [isFullscreen, setIsFullscreen] = useState(false)

  // 移动端视图模式状态
  const [viewMode, setViewMode] = useState<'chat' | 'preview'>('chat')

  // 桌面端：检测到专家活动时，右侧面板自动展开
  const hasExpertActivity = expertResults.length > 0 || Object.keys(artifactSessions).length > 0

  // 移动端：检测到专家活动时，自动切换到 preview 模式
  useEffect(() => {
    if (hasExpertActivity && viewMode === 'chat') {
      setViewMode('preview')
    }
  }, [hasExpertActivity])
  
  // 输入框状态
  const [inputValue, setInputValue] = useState('')

  // 👈 会话加载状态：确保 loadConversation 完成后再执行其他操作
  const [conversationLoaded, setConversationLoaded] = useState(false)

  // 同步 URL 的 agentId 到 store 的 selectedAgentId（使用规范化后的 ID）
  // 👈 同时设置 currentConversationId，确保新会话时 store 中的 ID 是最新的
  useEffect(() => {
    // 立即设置 currentConversationId，避免闭包捕获旧值
    if (conversationId) {
      const currentId = useChatStore.getState().currentConversationId
      if (currentId !== conversationId) {
        debug('设置 currentConversationId:', conversationId)
        setCurrentConversationId(conversationId)
      }
    }

    if (normalizedAgentId && normalizedAgentId !== selectedAgentId) {
      setSelectedAgentId(normalizedAgentId)
    }
  }, [conversationId, normalizedAgentId, selectedAgentId, setSelectedAgentId, setCurrentConversationId])

  // 加载历史会话
  useEffect(() => {
    // 重置加载状态
    setConversationLoaded(false)

    if (conversationId) {
      // 👈 如果是新会话（从首页跳转），跳过数据库加载，直接清空状态
      if (isNewConversation) {
        debug('新会话，设置 conversationId 并清空状态:', conversationId)
        // 👈 关键：立即设置 currentConversationId，确保消息发送到正确会话
        setCurrentConversationId(conversationId)
        // 👈 主动清空消息数组，防止旧消息泄露
        setMessages([])
        // 清空旧状态（消息由 useChat 的 sendMessage 添加）
        clearExpertResults()
        clearArtifactSessions()
        setConversationLoaded(true)
        return  // 👈 关键：新会话时不要调用 loadConversation
      }

      // 👈 关键修复：检查当前store中的conversationId是否与URL中的匹配
      // 如果不匹配，说明是从历史记录切换过来的，需要强制加载
      const storeCurrentId = useChatStore.getState().currentConversationId
      const isSwitchingConversation = storeCurrentId !== conversationId
      
      if (isSwitchingConversation) {
        debug('切换会话:', storeCurrentId, '->', conversationId)
        // 👈 立即清空旧消息，避免用户看到前一条会话的内容
        setMessages([])
      }

      // 否则从数据库加载历史会话
      loadConversation(conversationId)
        .then(() => {
          // 👈 标记会话加载完成
          setConversationLoaded(true)
          debug('历史会话加载完成，消息数量:', useChatStore.getState().messages.length)
        })
        .catch((error: any) => {
          // 会话不存在或加载失败，导航回首页
          if (error?.status === 404 || error?.message?.includes('404')) {
            navigate('/', { replace: true })
          }
        })
    } else {
      // 👈 无 conversationId 时清空所有状态
      clearExpertResults()
      clearArtifactSessions()
      setConversationLoaded(true) // 新会话无需加载，直接标记为完成
    }
  }, [conversationId, loadConversation, clearExpertResults, clearArtifactSessions, navigate, isNewConversation, setCurrentConversationId, setMessages])

  // 恢复草稿：新会话时检查 localStorage
  useEffect(() => {
    if (!conversationId) {
      const draft = localStorage.getItem('xpouch_chat_draft')
      if (draft && !inputValue) {
        setInputValue(draft)
        localStorage.removeItem('xpouch_chat_draft')
        // 可选：显示提示
        // toast({ title: t('draftRestored') })
      }
    }
  }, [conversationId])

  // 处理首页传来的消息（新建会话）
  useEffect(() => {
    // 👈 关键修复：确保会话加载完成后再发送消息，避免消息被错误地添加到旧会话
    if (isNewConversation && initialMessage && !isLoading && conversationId && conversationLoaded) {
      const timer = setTimeout(() => {
        sendMessage(initialMessage, normalizedAgentId)
        // 👈 发送消息后，清除 state 中的 isNew 和 startWith，保持 URL 纯净
        // 使用 replace: true 避免用户回退时再次触发发送
        navigate(`/chat/${conversationId}${searchParams.toString() ? '?' + searchParams.toString() : ''}`, {
          replace: true,
          state: {}  // 清除 state
        })
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [isNewConversation, initialMessage, isLoading, sendMessage, normalizedAgentId, navigate, conversationId, searchParams, conversationLoaded])

  // 处理专家卡片点击 - 切换到对应专家的 artifact 内容
  const handleExpertClick = useCallback((expertId: string) => {
    // 选中对应专家和 artifact session，右侧会自动显示该专家的第一个 artifact
    useCanvasStore.getState().selectExpert(expertId)
    useCanvasStore.getState().selectArtifactSession(expertId)
  }, [])

  // 处理消息中的链接点击（如"查看交付物"）- 切换到对应专家的 artifact 内容
  const handleLinkClick = useCallback((href: string) => {
    // 链接格式：#expertId，如 #writer
    const expertId = href.replace('#', '')
    if (expertId) {
      // 选中对应专家和 artifact session，右侧会自动显示该专家的第一个 artifact
      useCanvasStore.getState().selectExpert(expertId)
      useCanvasStore.getState().selectArtifactSession(expertId)
    }
  }, [])

  // 发送消息处理
  const handleSend = useCallback(() => {
    if (!inputValue.trim() || isLoading || isStreaming) return
    sendMessage(inputValue, normalizedAgentId)
    setInputValue('')
  }, [inputValue, isLoading, isStreaming, sendMessage, normalizedAgentId])

  // 当前选中的专家ID
  const selectedExpertId = selectedExpertSession

  // 处理 Artifact 点击
  const handleArtifactClick = useCallback((artifact: Artifact) => {
    // 从 artifact 的 source 或 id 中提取 expertType
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
      // 添加索引信息用于切换
      _index: idx
    }))
  }, [currentArtifactSession])

  // 当前选中的 artifact
  const currentArtifact = useMemo(() => {
    if (!currentArtifactSession || currentArtifactSession.artifacts.length === 0) return null
    // 返回当前索引的 artifact，如果索引无效则返回第一个
    const currentIndex = currentArtifactSession.currentIndex
    if (currentIndex >= 0 && currentIndex < currentArtifactSession.artifacts.length) {
      return {
        ...currentArtifactSession.artifacts[currentIndex],
        _index: currentIndex
      }
    }
    return { ...currentArtifactSession.artifacts[0], _index: 0 }
  }, [currentArtifactSession])

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
      {/* 工业风格头部 */}
      <IndustrialHeader
        onClose={() => navigate('/')}
        onMenuClick={sidebar.toggleMobile}
      />

      {/* 主内容区 */}
      <IndustrialChatLayout
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        isFullscreen={isFullscreen}
        chatStreamPanel={
          <ChatStreamPanel
            messages={messages}
            isGenerating={isStreaming || isLoading}
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
          <OrchestratorPanel
            experts={expertResults}
            activeExpertId={selectedExpertId}
            onExpertClick={handleExpertClick}
            artifactSession={currentArtifactSession}
            artifacts={currentExpertArtifacts}
            selectedArtifact={currentArtifact}
            onArtifactClick={handleArtifactClick}
            onSwitchArtifact={(index) => selectedExpertSession && switchArtifactIndex(selectedExpertSession, index)}
            isFullscreen={isFullscreen}
            onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
          />
        }
      />


    </div>
  )
}
