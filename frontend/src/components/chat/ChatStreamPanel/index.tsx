/**
 * =============================
 * 聊天流面板 (ChatStreamPanel)
 * =============================
 *
 * [架构层级] Layer 5 - 聊天界面组件
 *
 * [设计风格] Industrial Terminal (工业终端)
 * - 点阵背景：dot-grid
 * - 终端风格：等宽字体、行号、命令提示符
 * - 机械控制台：重型边框、阴影、物理开关
 *
 * [核心功能]
 * 1. 消息流渲染：用户消息 + AI 消息 + 路由指示器
 * 2. Markdown 支持：GFM 表格、代码高亮 (rehype-highlight)
 * 3. 输入控制台：Heavy Input Console（机械风格）
 * 4. 工具按钮：附件、网络搜索
 * 5. 🔥 Server-Driven UI：思维链可视化
 *
 * [组件拆分]
 * - EmptyState: 空状态展示
 * - MessageItem: 单条消息渲染
 * - ThinkingProcess: 思维链展示（气泡外）
 * - GeneratingIndicator: 生成中动画
 * - HeavyInputConsole: 输入控制台
 *
 * [状态管理]
 * - 所有状态通过 Props 传入，保持组件纯函数
 * - 状态管理由父组件和 Zustand Store 负责
 */

import { useRef, useEffect } from 'react'
import type { Message } from '@/types'
import EmptyState from '../EmptyState'
import MessageItem from '../MessageItem'
import ThinkingProcess from '../ThinkingProcess'
import GeneratingIndicator from '../GeneratingIndicator'
import ComplexModeIndicator from '../ComplexModeIndicator'
import HeavyInputConsole from '../HeavyInputConsole'
import PlanReviewCard from '../PlanReviewCard'  // 🔥🔥🔥 v3.5 HITL
import { parseThinkTags, formatThinkingAsSteps } from '@/utils/thinkParser'
import { useTaskStore } from '@/store/taskStore'
import { useChatStore } from '@/store/chatStore'  // 🔥🔥🔥 v3.5 HITL
import type { ResumeChatParams } from '@/services/chat'  // 🔥🔥🔥 v3.5 HITL

interface ChatStreamPanelProps {
  /** 消息列表 */
  messages: Message[]
  /** 是否正在生成回复 */
  isGenerating: boolean
  /** 当前输入值 */
  inputValue: string
  /** 输入框变化回调 */
  onInputChange: (value: string) => void
  /** 发送消息回调 */
  onSend: () => void
  /** 停止生成回调 */
  onStop?: () => void
  /** 当前活跃专家 (用于显示路由指示器) */
  activeExpert?: string | null
  /** 重新生成消息回调 */
  onRegenerate?: (messageId: string) => void
  /** 链接点击回调 */
  onLinkClick?: (href: string) => void
  /** 当前对话模式 */
  conversationMode?: 'simple' | 'complex'
  /** 点击消息预览回调（用于移动端切换到 preview 视图） */
  onPreview?: () => void
  /** 🔥🔥🔥 v3.5 HITL: 恢复执行回调 */
  resumeExecution?: (params: ResumeChatParams) => Promise<string>
}

/**
 * 提取消息的思考步骤
 * 支持：
 * 1. Complex 模式：只使用 msg.metadata.thinking（不解析 think 标签）
 * 2. Simple 模式：解析 <think></think> 标签
 */
function getMessageThinkingSteps(msg: Message, conversationMode: 'simple' | 'complex' = 'simple') {
  const steps: Array<{
    id: string
    expertType: string
    expertName: string
    content: string
    timestamp: string
    status: 'pending' | 'running' | 'completed' | 'failed'
    type?: 'search' | 'reading' | 'analysis' | 'coding' | 'planning' | 'writing' | 'default'
    duration?: number
    url?: string
  }> = []

  // 1. Complex 模式：只使用 metadata.thinking（不解析 think 标签，避免聚合报告中的 think 标签被解析）
  if (conversationMode === 'complex') {
    if (msg.metadata?.thinking && msg.metadata.thinking.length > 0) {
      steps.push(...msg.metadata.thinking)
    }
    return steps
  }

  // 2. Simple 模式：解析 <think></think> 标签
  if (msg.metadata?.thinking && msg.metadata.thinking.length > 0) {
    steps.push(...msg.metadata.thinking)
  }
  
  const parsed = parseThinkTags(msg.content)
  if (parsed.hasThinking && parsed.thinking) {
    steps.push(...formatThinkingAsSteps(parsed.thinking, 'completed'))
  }

  return steps
}

/**
 * 检查消息是否有思考内容（用于控制 indicator 显示）
 */
function hasActiveThinking(msg: Message, isStreaming: boolean, conversationMode: 'simple' | 'complex' = 'simple'): boolean {
  const steps = getMessageThinkingSteps(msg, conversationMode)
  if (steps.length === 0) return false
  
  // 如果有任何 running 状态的步骤，或者正在流式传输最后一条消息
  const hasRunning = steps.some(s => s.status === 'running')
  return hasRunning || isStreaming
}

/**
 * 左侧聊天流面板 - Industrial Style
 *
 * 包含：
 * 1. 消息列表 (Terminal 风格)
 * 2. 🔥 思维链展示（在消息气泡外）
 * 3. 底部输入控制台 (Heavy Input Console)
 */
export default function ChatStreamPanel({
  messages,
  isGenerating,
  inputValue,
  onInputChange,
  onSend,
  onStop,
  activeExpert,
  onRegenerate,
  onLinkClick,
  conversationMode = 'simple',
  onPreview,
  resumeExecution,  // 🔥🔥🔥 v3.5 HITL
}: ChatStreamPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  
  // 🔥 获取 estimatedSteps 用于固定步骤编号（已包含 planning 步骤）
  const estimatedSteps = useTaskStore(state => state.session?.estimatedSteps || 0)
  
  // 🔥🔥🔥 v3.5 HITL: 获取审核状态
  const isWaitingForApproval = useTaskStore(state => state.isWaitingForApproval)
  const conversationId = useChatStore(state => state.currentConversationId)

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, isGenerating])

  // 处理发送
  const handleSend = () => {
    if (!inputValue.trim() || isGenerating) return
    onSend()
  }

  // 过滤消息：在复杂模式下，隐藏内容为空的 AI 消息（避免显示空消息气泡）
  // 🔥 修复：如果消息有 thinking 数据，即使 content 为空也不过滤
  const hasRealContent = (msg: Message): boolean => {
    // 如果有 thinking 数据（metadata 或 think 标签），认为有实质内容
    const thinkingSteps = getMessageThinkingSteps(msg, conversationMode)
    if (thinkingSteps.length > 0) {
      return true
    }
    // 检查 content
    const content = msg.content || ''
    const stripped = content.replace(/\s/g, '').replace(/[\n\r\t]/g, '')
    return stripped.length > 0
  }

  // 复杂模式下始终过滤空 AI 消息（但保留有 thinking 的消息）
  const displayMessages = conversationMode === 'complex'
    ? messages.filter(msg => !(msg.role === 'assistant' && !hasRealContent(msg)))
    : messages

  // 🔥 判断最后一条消息是否有活跃的 thinking（用于控制 indicator 显示）
  const lastMessage = displayMessages[displayMessages.length - 1]
  const hasThinkingActive = lastMessage?.role === 'assistant' && hasActiveThinking(lastMessage, isGenerating, conversationMode)

  return (
    <>
      {/* 消息列表区域 */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-6 space-y-8 dot-grid scrollbar-hide"
      >
        {displayMessages.length === 0 ? (
          <EmptyState />
        ) : (
          displayMessages.map((msg, index) => {
            // 🔥 判断是否是最后一条消息且正在流式传输
            const isLastAndStreaming = isGenerating && 
              index === displayMessages.length - 1 && 
              msg.role === 'assistant'
            
            // 🔥 获取消息的思考步骤（根据模式选择是否解析 think 标签）
            const thinkingSteps = getMessageThinkingSteps(msg, conversationMode)
            
            // 🔥 使用更稳定的 key
            const messageKey = msg.id ? `${msg.id}-${index}` : `msg-${index}`
            
            // 🔥 修复：提取去除 think 标签后的实际内容
            const parsedContent = parseThinkTags(msg.content).content || msg.content || ''
            const hasActualContent = parsedContent.replace(/\s/g, '').length > 0
            
            // 🔥🔥🔥 关键修复：在复杂模式下，只显示最后一条有 thinking 的消息
            // 避免页面刷新后出现多个 ThinkingProcess
            const isLastMessageWithThinking = index === displayMessages.length - 1 || 
              !displayMessages.slice(index + 1).some(m => 
                getMessageThinkingSteps(m, conversationMode).length > 0
              )
            
            return (
              <div key={messageKey}>
                {/* 🔥 思维链展示（在消息气泡外） */}
                {/* 只在最后一条有 thinking 的消息显示 ThinkingProcess */}
                {thinkingSteps.length > 0 && isLastMessageWithThinking && (
                  <ThinkingProcess 
                    steps={thinkingSteps}
                    isThinking={isLastAndStreaming}
                    totalSteps={estimatedSteps > 0 ? estimatedSteps : thinkingSteps.length}  // 🔥 优先使用 estimatedSteps
                  />
                )}
                
                {/* 🔥 消息内容 - 只在有实际内容时显示（去除 think 标签后） */}
                {hasActualContent && (
                  <MessageItem
                    message={{
                      ...msg,
                      content: parsedContent
                    }}
                    isLast={index === displayMessages.length - 1}
                    activeExpert={activeExpert}
                    onRegenerate={onRegenerate}
                    onLinkClick={onLinkClick}
                    onPreview={onPreview}
                  />
                )}
              </div>
            )
          })
        )}

        {/* 🔥 生成中指示器 - 只有没有 thinking 时才显示 */}
        {isGenerating && !hasThinkingActive && (
          conversationMode === 'complex' ? (
            <ComplexModeIndicator activeExpert={activeExpert} isProcessing={true} />
          ) : (
            <GeneratingIndicator />
          )
        )}
        
        {/* 🔥🔥🔥 v3.5 HITL: 计划审核卡片（当 Commander 规划完成时显示） */}
        {isWaitingForApproval && conversationId && resumeExecution && (
          <PlanReviewCard 
            conversationId={conversationId} 
            resumeExecution={resumeExecution}
          />
        )}
      </div>

      {/* 底部输入控制台 */}
      <HeavyInputConsole
        value={inputValue}
        onChange={onInputChange}
        onSend={handleSend}
        onStop={onStop}
        disabled={isGenerating}
      />
    </>
  )
}

// 导出类型供外部使用
export type { ChatStreamPanelProps }
