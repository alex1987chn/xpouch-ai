/**
 * =============================
 * 聊天流面板 (ChatStreamPanel)
 * =============================
 *
 * [架构层级] Layer 5 - 聊天界面组件
 *
 * [设计风格] 柔和工作台（蓝本 docs/design：消息流 + 专家署名 + 输入台）
 * - 暖调浅底：用户气泡 surface-tint、AI 无气泡全宽排版
 * - 输入台：圆角大卡 + 圆形发送钮
 * - 语义 token 驱动，随 soft/dark 主题切换
 *
 * [核心功能]
 * 1. 消息流渲染：用户消息 + AI 消息 + 路由指示器
 * 2. Markdown 支持：GFM 表格、代码高亮 (CodeBlock)
 * 3. 输入控制台：Heavy Input Console（机械风格）
 * 4. 工具按钮：附件、网络搜索
 * 5. Server-Driven UI：思维链可视化
 * 6. 轮询状态栏：显示运行中任务的恢复状态
 *
 * [组件拆分]
 * - EmptyState: 空状态展示
 * - MessageItem: 单条消息渲染（含 StatusAvatar 状态头像）
 * - ThinkingProcess: 思维链展示（气泡外）
 * - HeavyInputConsole: 输入控制台
 * - RunPollingBar: 轮询状态栏
 *
 * [状态管理]
 * - 所有状态通过 Props 传入，保持组件纯函数
 * - 状态管理由父组件和 Zustand Store 负责
 *
 * [性能优化] v3.1.0
 * - 使用 Zustand Selectors 避免不必要的重渲染
 * - 流式输出时组件保持静止
 */

import { useRef, useState, useEffect, useLayoutEffect, useCallback, useMemo } from 'react'
import { ArrowDown } from 'lucide-react'
import { useTranslation } from '@/i18n'
import type { Message } from '@/types'
import EmptyState from '../EmptyState'
import MessageItem from '../MessageItem'
import ThinkingProcess from '../ThinkingProcess'
import HeavyInputConsole from '../HeavyInputConsole'
import PlanReviewCard from '../PlanReviewCard'
import { RunPollingBar } from '../RunPollingBar'
import { parseThinkTags, formatThinkingAsSteps } from '@/utils/thinkParser'
import { isSameId } from '@/utils/normalize'
import type { ResumeChatParams } from '@/services/chat'
import type { AvatarStatus } from '@/components/ui/StatusAvatar'
import type { RunStatus } from '@/types/run'
import type { ChatDocument } from '../types'

// Performance Optimized Selectors (v3.1.0)
import {
  useMessages,
  useIsGenerating,
  useCurrentConversationId,
} from '@/hooks/useChatSelectors'

// Phase 2: Server-Driven UI - 使用 TaskStore
import {
  useTaskMode,
  useIsWaitingForApproval,
  useRunningTaskIds,
  usePendingPlan,
} from '@/hooks/useTaskSelectors'

interface ChatStreamPanelProps {
  /** 输入态（避免扁平 props 过多） */
  input: {
    value: string
    onChange: (value: string) => void
  }
  /** v3.4.7 图片输入：当前轮随消息发送的图片（dataURL，父层持有状态） */
  images?: string[]
  onImagesSelected?: (images: string[]) => void
  documents?: ChatDocument[]
  onDocumentsSelected?: (documents: ChatDocument[]) => void
  onRemoveDocument?: (index: number) => void
  onRemoveImage?: (index: number) => void
  /** 行为回调（避免扁平 props 过多） */
  actions: {
    onSend: () => void
    onStop?: () => void
    onRegenerate?: (messageId: string | number) => void
    onLinkClick?: (href: string) => void
  }
  /** v3.1.0 HITL: 恢复执行回调 */
  resumeExecution?: (params: ResumeChatParams) => Promise<string>
  /** v3.4.0 轮询状态 */
  polling?: {
    isPolling: boolean
    status: RunStatus | null
    isHITLPaused: boolean
    hasError?: boolean
    onRefresh: () => void
  }
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

// ============================================================================
// 渲染期解析缓存：面板随流式每次 flush 重渲染，历史消息的
// think 解析/步骤提取结果是稳定的，不必每帧重算（长会话显著省主线程）
// ============================================================================

/** 正文解析缓存：键为内容字符串，内容不变即命中（流式消息每次 flush 产生新键，靠容量上限淘汰） */
const parsedContentCache = new Map<string, string>()
function cachedParsedContent(rawContent: string): string {
  const hit = parsedContentCache.get(rawContent)
  if (hit !== undefined) return hit
  const parsed = parseThinkTags(rawContent).content || rawContent
  if (parsedContentCache.size > 500) parsedContentCache.clear()
  parsedContentCache.set(rawContent, parsed)
  return parsed
}

/** thinking 步骤缓存：按消息对象弱引用（流式消息更新时对象替换，缓存自然失效） */
const thinkingStepsCache = new WeakMap<Message, ReturnType<typeof getMessageThinkingSteps>>()
function cachedThinkingSteps(msg: Message) {
  let steps = thinkingStepsCache.get(msg)
  if (!steps) {
    steps = getMessageThinkingSteps(msg)
    thinkingStepsCache.set(msg, steps)
  }
  return steps
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
  input,
  actions,
  images,
  documents,
  onDocumentsSelected,
  onRemoveDocument,
  onImagesSelected,
  onRemoveImage,
  resumeExecution,
  polling,
}: ChatStreamPanelProps) {
  const { t } = useTranslation()
  const scrollRef = useRef<HTMLDivElement>(null)
  
  // Performance Optimized Selectors (v3.1.0)
  // Only re-render when these specific values change
  const messages = useMessages()
  const isGenerating = useIsGenerating()
  const threadId = useCurrentConversationId()
  
  // Phase 2: Server-Driven UI - 使用 TaskStore
  const mode = useTaskMode()
  const isWaitingForApproval = useIsWaitingForApproval()
  const runningTaskIds = useRunningTaskIds()
  const pendingPlan = usePendingPlan()
  
  // 从 TaskStore 计算状态
  const isExecuting = mode === 'complex' && runningTaskIds.size > 0
  const isPlanning = mode === 'complex' && !isExecuting && !isWaitingForApproval
  
  // 当前活跃专家（从运行中的任务获取）
  const activeExpert = null // 暂不使用，后续可从 runningTaskIds 获取
  
  // 获取计划步骤数
  const estimatedSteps = pendingPlan.length || 0

  // Auto-scroll to bottom —— 尊重阅读位置：
  // 流式输出时默认跟随滚底；用户主动上滑（距底 > 阈值）即停止跟随并浮现
  // "回到底部"，滑回底部或点按钮恢复跟随。React 19: useLayoutEffect 防滚动闪烁
  const followBottomRef = useRef(true)
  const [showJumpToBottom, setShowJumpToBottom] = useState(false)

  useLayoutEffect(() => {
    if (scrollRef.current && followBottomRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, isGenerating])

  // 切换会话：新现场从底部开始
  useEffect(() => {
    followBottomRef.current = true
    setShowJumpToBottom(false)
  }, [threadId])

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    const following = distanceFromBottom < 80
    followBottomRef.current = following
    setShowJumpToBottom(!following)
  }, [])

  const jumpToBottom = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    followBottomRef.current = true
    setShowJumpToBottom(false)
  }, [])

  // Handle send
  const handleSend = useCallback(() => {
    if ((!input.value.trim() && !images?.length) || isGenerating) return
    actions.onSend()
  }, [input.value, isGenerating, actions, images])

  // 缓存回调函数，避免 MessageItem 不必要的重渲染
  const handleRegenerate = useCallback((messageId: string | number) => {
    actions.onRegenerate?.(messageId)
  }, [actions])

  const handleLinkClick = useCallback((href: string) => {
    actions.onLinkClick?.(href)
  }, [actions])

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

  // Phase 2: Server-Driven UI - 使用 TaskStore 状态
  // 在执行中或计划审核阶段，隐藏空AI消息
  const isInExecution = isExecuting || isWaitingForApproval || isPlanning
  const displayMessages = isInExecution
    ? messages.filter(msg => {
        // 保留非AI消息
        if (msg.role !== 'assistant') return true
        // 保留有实际内容的AI消息
        if (hasRealContent(msg)) return true
        // 🔥 保留正在生成中的AI消息（最后一条且正在生成）
        // 🔥 使用规范化工具比较 ID
        const isLast = isSameId(msg.id, messages[messages.length - 1]?.id)
        return isGenerating && isLast
      })
    : messages

  // O(n) 预计算：最后一条带 thinking 的消息索引。
  // 替代 map 内每项对后续消息的 O(n) 扫描（流式时整体 O(n²)/帧 的放大器）。
  const lastThinkingIndex = useMemo(() => {
    for (let i = displayMessages.length - 1; i >= 0; i--) {
      if (cachedThinkingSteps(displayMessages[i]).length > 0) return i
    }
    return -1
  }, [displayMessages])

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
    
    // Phase 2: Server-Driven UI - 优先使用 TaskStore 状态
    if (isPlanning || isExecuting) return 'thinking'
    
    // 后备：从消息 metadata 判断
    const steps = getMessageThinkingSteps(msg)
    const hasRunningStep = steps.some(s => s.status === 'running')
    
    if (hasRunningStep) return 'thinking'
    return 'streaming'
  }

  return (
    <>
      {/* Message list area（外层 relative 供"回到底部"悬浮钮定位） */}
      <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto"
      >
        {/* 对话列：居中 760px（蓝本 conv-inner 语法） */}
        <div className="mx-auto w-full max-w-[760px] space-y-8 px-6 pb-5 pt-5">
        {displayMessages.length === 0 ? (
          <EmptyState />
        ) : (
          displayMessages.map((msg, index) => {
            const isLastAndStreaming = isGenerating && 
              index === displayMessages.length - 1 && 
              msg.role === 'assistant'
            
            const thinkingSteps = cachedThinkingSteps(msg)
            const messageKey = msg.id ? `${msg.id}-${index}` : `msg-${index}`
            
            // 🔥 修复：确保 content 不为 undefined，避免显示 'undefined'
            const rawContent = msg.content || ''
            const parsedContent = cachedParsedContent(rawContent)
            const hasActualContent = parsedContent.replace(/\s/g, '').length > 0
            
            // Only show ThinkingProcess on the last message with thinking
            // （lastThinkingIndex 已预计算；无任何 thinking 时该分支不会进入）
            const isLastMessageWithThinking = index === lastThinkingIndex
            
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
                    activeExpert={activeExpert}
                    aiStatus={getMessageStatus(msg, index)}
                    onRegenerate={handleRegenerate}
                    onLinkClick={handleLinkClick}
                  />
                )}
              </div>
            )
          })
        )}

        {/* Phase 2: Server-Driven UI - Plan review card 基于 executionStatus */}
        {/* 使用 key 强制重新挂载，避免 useEffect 同步 Props 反模式 */}
        {isWaitingForApproval && threadId && resumeExecution && (
          <PlanReviewCard
            key={`plan-review-${threadId}`}
            threadId={threadId}
            resumeExecution={resumeExecution}
          />
        )}
        </div>
      </div>

      {/* 回到底部：用户上滑阅读时浮现（定位于滚动容器外层，不随内容滚动） */}
      {showJumpToBottom && (
        <button
          onClick={jumpToBottom}
          title={t('jumpToBottom')}
          className="absolute bottom-4 right-4 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-border-divider bg-surface-card text-content-secondary shadow-theme-card transition-colors hover:text-content-primary"
        >
          <ArrowDown className="h-4 w-4" />
        </button>
      )}
      </div>

      {/* v3.4.0 轮询状态栏（输入框上方） */}
      {/* 🔥 修复：HITL 审核时不显示轮询状态栏，避免与 PlanReviewCard 重复提示 */}
      <RunPollingBar
        show={(polling?.isPolling ?? false) && !isWaitingForApproval}
        status={polling?.status ?? null}
        isHITLPaused={polling?.isHITLPaused ?? false}
        hasError={polling?.hasError ?? false}
        onRefresh={polling?.onRefresh ?? (() => {})}
      />

      {/* Bottom input console */}
      <HeavyInputConsole
        value={input.value}
        onChange={input.onChange}
        onSend={handleSend}
        onStop={actions.onStop}
        disabled={isGenerating}
        images={images}
        onImagesSelected={onImagesSelected}
        onRemoveImage={onRemoveImage}
        documents={documents}
        onDocumentsSelected={onDocumentsSelected}
        onRemoveDocument={onRemoveDocument}
      />
    </>
  )
}

// Export types for external use
export type { ChatStreamPanelProps }
