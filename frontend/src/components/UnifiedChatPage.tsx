import { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom'
import { useCanvasStore } from '@/store/canvasStore'
import { useChatStore } from '@/store/chatStore'
import { useChat } from '@/hooks/useChat'

import { SYSTEM_AGENTS, getSystemAgentName } from '@/constants/agents'
import { getConversationMode, normalizeAgentId } from '@/utils/agentUtils'

// 新布局组件
import { IndustrialChatLayout, ChatStreamPanel, OrchestratorPanel } from './layout'
// 工业风格头部和专家详情弹窗
import { IndustrialHeader } from './chat/IndustrialHeader'
import { ExpertDetailModal } from './chat/ExpertDetailModal'
import type { Artifact } from '@/types'
import type { ExpertResult } from '@/store/canvasStore'

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
 * - 简单模式: `/chat?conversation=xxx&agentId=xxx`
 * - 复杂模式: `/chat/:id?agentId=ai-assistant`
 *
 * [状态管理]
 * - useChat: 消息流逻辑
 * - useCanvasStore: 专家结果 + Artifact 会话
 * - useChatStore: 当前智能体 + 自定义智能体
 */
export default function UnifiedChatPage() {

  const navigate = useNavigate()
  const location = useLocation()
  const { id: conversationId } = useParams()
  const [searchParams] = useSearchParams()

  const agentId = searchParams.get('agentId') || 'default-chat'
  const normalizedAgentId = normalizeAgentId(agentId)
  const isNewConversation = searchParams.get('new') === 'true'
  const initialMessage = (location.state as { startWith?: string })?.startWith

  // 判断模式
  const mode = useMemo(() => getConversationMode(normalizedAgentId), [normalizedAgentId])


  const {
    messages,
    isStreaming,
    isLoading,
    sendMessage,
    loadConversation
  } = useChat()

  const setSelectedAgentId = useChatStore(state => state.setSelectedAgentId)
  const selectedAgentId = useChatStore(state => state.selectedAgentId)
  const customAgents = useChatStore(state => state.customAgents)
  
  // 计算当前智能体，避免 getCurrentAgent() 每次返回新对象
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
    } else if (selectedAgentId === SYSTEM_AGENTS.ORCHESTRATOR) {
      return {
        id: SYSTEM_AGENTS.ORCHESTRATOR,
        name: getSystemAgentName(SYSTEM_AGENTS.ORCHESTRATOR),
        description: '复杂任务拆解、专家协作、智能聚合',
        category: 'AI',
        isCustom: false,
        is_builtin: false,
        modelId: 'deepseek-chat',
        icon: null,
        systemPrompt: ''
      }
    } else {
      return customAgents.find(a => a.id === selectedAgentId)
    }
  }, [selectedAgentId, customAgents])

  const {
    artifactSessions,
    selectedExpertSession,
    selectArtifactSession,
    clearArtifactSessions,
    expertResults,
    clearExpertResults
  } = useCanvasStore()


  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [previewExpert, setPreviewExpert] = useState<ExpertResult | null>(null)
  
  // 移动端视图模式状态
  const [viewMode, setViewMode] = useState<'chat' | 'preview'>('chat')
  
  // 输入框状态
  const [inputValue, setInputValue] = useState('')

  // 同步 URL 的 agentId 到 store 的 selectedAgentId（使用规范化后的 ID）
  useEffect(() => {
    if (normalizedAgentId && normalizedAgentId !== selectedAgentId) {
      setSelectedAgentId(normalizedAgentId)
    }
  }, [normalizedAgentId, selectedAgentId, setSelectedAgentId])

  // 加载历史会话
  useEffect(() => {
    if (conversationId) {
      loadConversation(conversationId)
    } else {
      clearExpertResults()
      clearArtifactSessions()
    }
  }, [conversationId, loadConversation, clearExpertResults, clearArtifactSessions])

  // 处理首页传来的消息
  useEffect(() => {
    if (isNewConversation && initialMessage && !isLoading) {
      const timer = setTimeout(() => {
        sendMessage(initialMessage, normalizedAgentId)
        const newParams = new URLSearchParams(searchParams)
        newParams.delete('new')
        navigate(`${location.pathname}?${newParams.toString()}`, { replace: true })
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [isNewConversation, initialMessage, isLoading, sendMessage, normalizedAgentId, navigate, searchParams, location.pathname])

  // 处理专家卡片点击
  const handleExpertClick = useCallback((expertId: string) => {
    const expert = expertResults.find((e: ExpertResult) => e.expertType === expertId)
    if (expert) {
      setPreviewExpert(expert)
      setShowPreviewModal(true)
      useCanvasStore.getState().selectExpert(expert.expertType)
    }
  }, [expertResults])

  // 关闭预览弹窗
  const handleCloseModal = useCallback(() => {
    setShowPreviewModal(false)
    setPreviewExpert(null)
  }, [])



  // 发送消息处理
  const handleSend = useCallback(() => {
    if (!inputValue.trim() || isLoading || isStreaming) return
    sendMessage(inputValue, normalizedAgentId)
    setInputValue('')
  }, [inputValue, isLoading, isStreaming, sendMessage, normalizedAgentId])

  // 模式切换处理（简单/复杂模式切换）
  const handleModeChange = useCallback((newMode: 'simple' | 'complex') => {
    const targetAgentId = newMode === 'complex' ? SYSTEM_AGENTS.ORCHESTRATOR : SYSTEM_AGENTS.DEFAULT_CHAT
    navigate(`/chat?agentId=${targetAgentId}`, { replace: true })
  }, [navigate])

  // 当前选中的专家ID
  const selectedExpertId = selectedExpertSession

  // 处理 Artifact 点击
  const handleArtifactClick = useCallback((artifact: Artifact) => {
    // 从 artifact.id 中提取 expertType
    // 格式：`${session.expertType}-${artifact.id}`
    const expertType = artifact.id.split('-')[0]
    selectArtifactSession(expertType)
  }, [selectArtifactSession])

  // 所有 artifacts 平铺为列表
  const allArtifacts = useMemo(() => {
    const artifacts: Artifact[] = []
    artifactSessions.forEach((session: any) => {
      session.artifacts.forEach((artifact: any, idx: number) => {
        // 确保 artifact 符合 Artifact 接口
        artifacts.push({
          id: `${session.expertType}-${artifact.id}`,
          type: artifact.type as 'code' | 'markdown' | 'search' | 'html' | 'text',
          language: artifact.language,
          content: artifact.content,
          source: artifact.source,
          title: artifact.title || `${session.expertType}-${idx + 1}`,
          timestamp: artifact.timestamp
        })
      })
    })
    return artifacts
  }, [artifactSessions])

  // 当前选中的 artifact
  const currentArtifact = useMemo(() => {
    if (allArtifacts.length === 0) return null
    // 根据选中的专家类型找到对应的 artifact
    const selected = allArtifacts.find(a => a.id.includes(selectedExpertSession || ''))
    return selected || allArtifacts[0] || null
  }, [allArtifacts, selectedExpertSession])

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
      <IndustrialHeader onClose={() => navigate('/')} />

      {/* 主内容区 */}
      <IndustrialChatLayout
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        chatStreamPanel={
          <ChatStreamPanel
            messages={messages}
            isGenerating={isStreaming || isLoading}
            inputValue={inputValue}
            onInputChange={setInputValue}
            onSend={handleSend}
            mode={mode}
            onModeChange={handleModeChange}
            activeExpert={selectedExpertId}
          />
        }
        orchestratorPanel={
          <OrchestratorPanel
            experts={expertResults}
            activeExpertId={selectedExpertId}
            onExpertClick={handleExpertClick}
            artifacts={allArtifacts}
            selectedArtifact={currentArtifact}
            onArtifactClick={handleArtifactClick}
            isFullscreen={isFullscreen}
            onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
          />
        }
      />

      {/* 专家详情弹窗 */}
      <ExpertDetailModal
        isOpen={showPreviewModal}
        onClose={handleCloseModal}
        expert={previewExpert}
      />
    </div>
  )
}
