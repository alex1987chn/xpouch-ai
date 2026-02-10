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
 * 5. Server-Driven UI：思维链可视化
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
 *
 * [性能优化] v3.1.0
 * - 使用 Zustand Selectors 避免不必要的重渲染
 * - 流式输出时组件保持静止
 */

import { useRef, useEffect } from 'react'
import type { Message } from '@/types'
import EmptyState from '../EmptyState'
import MessageItem from '../MessageItem'
import ThinkingProcess from '../ThinkingProcess'
import GeneratingIndicator from '../GeneratingIndicator'
import HeavyInputConsole from '../HeavyInputConsole'
import PlanReviewCard from '../PlanReviewCard'
import { parseThinkTags, formatThinkingAsSteps } from '@/utils/thinkParser'
import type { ResumeChatParams } from '@/services/chat'

// Performance Optimized Selectors (v3.1.0)
import {
  useMessages,
  useIsGenerating,
  useCurrentConversationId,
} from '@/hooks/useChatSelectors'
import {
  useTaskMode,
  useRunningTaskIds,
  useTasksCache,
  useTaskSession,
  useIsWaitingForApproval,
} from '@/hooks/useTaskSelectors'

interface ChatStreamPanelProps {
  /** 当前输入值 */
  inputValue: string
  /** 输入框变化回调 */
  onInputChange: (value: string) => void
  /** 发送消息回调 */
  onSend: () => void
  /** 停止生成回调 */
  onStop?: () => void
  /** 重新生成消息回调 */
  onRegenerate?: (messageId: string) => void
  /** 链接点击回调 */
  onLinkClick?: (href: string) => void
  /** 点击消息预览回调（用于移动端切换到 preview 视图） */
  onPreview?: () => void
  /** v3.1.0 HITL: 恢复执行回调 */
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
  
  const hasRunning = steps.some(s => s.status === 'running')
  return hasRunning || isStreaming
}

/**
 * 左侧聊天流面板 - Industrial Style
 *
 * 包含：
 * 1. 消息列表 (Terminal 风格)
 * 2. 思维链展示（在消息气泡外）
 * 3. 底部输入控制台 (Heavy Input Console)
 */
export default function ChatStreamPanel({
  inputValue,
  onInputChange,
  onSend,
  onStop,
  onRegenerate,
  onLinkClick,
  onPreview,
  resumeExecution,
}: ChatStreamPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  
  // Performance Optimized Selectors (v3.1.0)
  // Only re-render when these specific values change
  const messages = useMessages()
  const isGenerating = useIsGenerating()
  const conversationId = useCurrentConversationId()
  
  // Task-related selectors
  const mode = useTaskMode()
  const conversationMode = mode || 'simple'
  const runningTaskIds = useRunningTaskIds()
  const tasks = useTasksCache()
  const session = useTaskSession()
  const isWaitingForApproval = useIsWaitingForApproval()
  
  // Derive active expert from running tasks
  const activeExpert = runningTaskIds.size > 0
    ? tasks.find(t => runningTaskIds.has(t.id))?.expert_type || null
    : null
  
  // Get estimated steps from session
  const estimatedSteps = session?.estimatedSteps || 0

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, isGenerating])

  // Handle send
  const handleSend = () => {
    if (!inputValue.trim() || isGenerating) return
    onSend()
  }

  // Check if message has real content (for filtering)
  const hasRealContent = (msg: Message): boolean => {
    const thinkingSteps = getMessageThinkingSteps(msg, conversationMode)
    if (thinkingSteps.length > 0) {
      return true
    }
    const content = msg.content || ''
    const stripped = content.replace(/\s/g, '').replace(/[\n\r\t]/g, '')
    return stripped.length > 0
  }

  // Filter messages: in complex mode, hide empty AI messages
  const displayMessages = conversationMode === 'complex'
    ? messages.filter(msg => !(msg.role === 'assistant' && !hasRealContent(msg)))
    : messages

  // Check if last message has active thinking
  const lastMessage = displayMessages[displayMessages.length - 1]
  const hasThinkingActive = lastMessage?.role === 'assistant' && hasActiveThinking(lastMessage, isGenerating, conversationMode)

  return (
    <>
      {/* Message list area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-6 space-y-8 dot-grid scrollbar-hide"
      >
        {displayMessages.length === 0 ? (
          <EmptyState />
        ) : (
          displayMessages.map((msg, index) => {
            const isLastAndStreaming = isGenerating && 
              index === displayMessages.length - 1 && 
              msg.role === 'assistant'
            
            const thinkingSteps = getMessageThinkingSteps(msg, conversationMode)
            const messageKey = msg.id ? `${msg.id}-${index}` : `msg-${index}`
            
            const parsedContent = parseThinkTags(msg.content).content || msg.content || ''
            const hasActualContent = parsedContent.replace(/\s/g, '').length > 0
            
            // Only show ThinkingProcess on the last message with thinking
            const isLastMessageWithThinking = index === displayMessages.length - 1 || 
              !displayMessages.slice(index + 1).some(m => 
                getMessageThinkingSteps(m, conversationMode).length > 0
              )
            
            return (
              <div key={messageKey}>
                {/* Thinking chain display (outside message bubble) */}
                {thinkingSteps.length > 0 && isLastMessageWithThinking && (
                  <ThinkingProcess 
                    steps={thinkingSteps}
                    isThinking={isLastAndStreaming}
                    totalSteps={estimatedSteps > 0 ? estimatedSteps : thinkingSteps.length}
                  />
                )}
                
                {/* Message content - only show when there's actual content */}
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

        {/* Generating indicator - only show when no thinking */}
        {isGenerating && !hasThinkingActive && (
          <GeneratingIndicator mode={conversationMode} />
        )}
        
        {/* v3.1.0 HITL: Plan review card */}
        {isWaitingForApproval && conversationId && resumeExecution && (
          <PlanReviewCard 
            conversationId={conversationId} 
            resumeExecution={resumeExecution}
          />
        )}
      </div>

      {/* Bottom input console */}
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

// Export types for external use
export type { ChatStreamPanelProps }
