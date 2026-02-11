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
 * - MessageItem: 单条消息渲染（含 StatusAvatar 状态头像）
 * - ThinkingProcess: 思维链展示（气泡外）
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
import HeavyInputConsole from '../HeavyInputConsole'
import PlanReviewCard from '../PlanReviewCard'
import { parseThinkTags, formatThinkingAsSteps } from '@/utils/thinkParser'
import type { ResumeChatParams } from '@/services/chat'
import type { AvatarStatus } from '@/components/ui/StatusAvatar'

// Performance Optimized Selectors (v3.1.0)
import {
  useMessages,
  useIsGenerating,
  useCurrentConversationId,
} from '@/hooks/useChatSelectors'

// Phase 2: Server-Driven UI - 使用 ExecutionStore 替代 TaskStore
import {
  useExecutionStatus,
  useCurrentExpert,
  useThinkingTrace,
  useExecutionPlan,
  useExecutionActions,
} from '@/store/executionStore'

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
 * Phase 2: Server-Driven UI - 只使用 metadata.thinking
 * 不再解析 content 中的 `` 标签，避免重复显示
 */
function getMessageThinkingSteps(msg: Message) {
  // 只使用 metadata.thinking，避免重复显示
  if (msg.metadata?.thinking && msg.metadata.thinking.length > 0) {
    return msg.metadata.thinking
  }

  // 兼容旧消息：如果没有 metadata.thinking，则解析 content 中的 `` 标签
  const parsed = parseThinkTags(msg.content || '')
  if (parsed.hasThinking && parsed.thinking) {
    return formatThinkingAsSteps(parsed.thinking, 'completed')
  }

  return []
}

/**
 * 检查消息是否有思考内容（用于控制 indicator 显示）
 * Phase 2: Server-Driven UI - 简化逻辑
 */
function hasActiveThinking(msg: Message, isStreaming: boolean): boolean {
  const steps = getMessageThinkingSteps(msg)
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
  
  // Phase 2: Server-Driven UI - 使用 ExecutionStore 替代 TaskStore
  const executionStatus = useExecutionStatus()
  const currentExpert = useCurrentExpert()
  const thinkingTrace = useThinkingTrace()
  const executionPlan = useExecutionPlan()
  const { reset: resetExecutionStore } = useExecutionActions()
  
  // 从 ExecutionStore 获取状态
  const isWaitingForApproval = executionStatus === 'reviewing'
  const isExecuting = executionStatus === 'executing'
  const isPlanning = executionStatus === 'planning'
  
  // 当前活跃专家
  const activeExpert = currentExpert?.type || null
  
  // 获取计划步骤数
  const estimatedSteps = executionPlan.length

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
    const thinkingSteps = getMessageThinkingSteps(msg)
    if (thinkingSteps.length > 0) {
      return true
    }
    // 🔥 修复：确保 content 不为 undefined
    const content = (msg.content || '').replace(/\s/g, '').replace(/[\n\r\t]/g, ' ')
    return content.length > 0
  }

  // Phase 2: Server-Driven UI - 使用 executionStatus 替代 conversationMode
  // 在执行中或计划审核阶段，隐藏空AI消息
  const isInExecution = executionStatus === 'executing' || executionStatus === 'reviewing' || executionStatus === 'planning'
  const displayMessages = isInExecution
    ? messages.filter(msg => {
        // 保留非AI消息
        if (msg.role !== 'assistant') return true
        // 保留有实际内容的AI消息
        if (hasRealContent(msg)) return true
        // 🔥 保留正在生成中的AI消息（最后一条且正在生成）
        const isLast = msg.id === messages[messages.length - 1]?.id
        return isGenerating && isLast
      })
    : messages

  // Check if last message has active thinking
  const lastMessage = displayMessages[displayMessages.length - 1]
  const hasThinkingActive = lastMessage?.role === 'assistant' && hasActiveThinking(lastMessage, isGenerating)
  
  /**
   * 计算消息的 AI 状态
   * 只有最后一条 AI 消息根据全局状态显示 thinking/streaming
   * 历史消息一律显示 idle
   */
  const getMessageStatus = (msg: Message, index: number): AvatarStatus => {
    const isLastAiMessage = 
      isGenerating && 
      index === displayMessages.length - 1 && 
      msg.role === 'assistant'
    
    if (!isLastAiMessage) return 'idle'
    
    // Phase 2: Server-Driven UI - 优先使用 ExecutionStore 状态
    if (isPlanning || isExecuting) return 'thinking'
    
    // 后备：从消息 metadata 判断
    const steps = getMessageThinkingSteps(msg)
    const hasRunningStep = steps.some(s => s.status === 'running')
    
    if (hasRunningStep) return 'thinking'
    return 'streaming'
  }

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
            
            const thinkingSteps = getMessageThinkingSteps(msg)
            const messageKey = msg.id ? `${msg.id}-${index}` : `msg-${index}`
            
            // 🔥 修复：确保 content 不为 undefined，避免显示 'undefined'
            const rawContent = msg.content || ''
            const parsedContent = parseThinkTags(rawContent).content || rawContent
            const hasActualContent = parsedContent.replace(/\s/g, '').length > 0
            
            // Only show ThinkingProcess on the last message with thinking
            const isLastMessageWithThinking = index === displayMessages.length - 1 || 
              !displayMessages.slice(index + 1).some(m => 
                getMessageThinkingSteps(m).length > 0
              )
            
            return (
              <div key={messageKey}>
                {/* Thinking chain display (outside message bubble, BEFORE message content) */}
                {/* 常规布局：思考过程在消息上方 */}
                {thinkingSteps.length > 0 && isLastMessageWithThinking && (
                  <div className="mb-4">
                    <ThinkingProcess 
                      steps={thinkingSteps}
                      isThinking={isLastAndStreaming}
                      totalSteps={estimatedSteps > 0 ? estimatedSteps : thinkingSteps.length}
                    />
                  </div>
                )}
                
                {/* 
                  Message content 
                  - 有实际内容时显示完整消息
                  - 正在生成中的空AI消息显示占位状态
                */}
                {(hasActualContent || (isLastAndStreaming && !hasActualContent)) && (
                  <MessageItem
                    message={{
                      ...msg,
                      content: parsedContent
                    }}
                    isLast={index === displayMessages.length - 1}
                    activeExpert={activeExpert}
                    aiStatus={getMessageStatus(msg, index)}
                    onRegenerate={onRegenerate}
                    onLinkClick={onLinkClick}
                    onPreview={onPreview}
                  />
                )}
              </div>
            )
          })
        )}

        {/* Phase 2: Server-Driven UI - Plan review card 基于 executionStatus */}
        {/* 使用 key 强制重新挂载，避免 useEffect 同步 Props 反模式 */}
        {isWaitingForApproval && conversationId && resumeExecution && (
          <PlanReviewCard 
            key={`plan-review-${conversationId}`}
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
