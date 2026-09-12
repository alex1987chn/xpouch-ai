/**
 * WorkbenchChatCore - 工作台中栏「对话流」
 *
 * [复用] 编排序列与 UnifiedChatPage 完全一致（生产验证过的组合）：
 *   useChat({threadUrlBase}) → useSessionRestore → useRunPolling →
 *   useChatSessionHandoff → usePendingMessageRetry → ChatStreamPanel
 * 消息不经 props（ChatStreamPanel 自取 store），此处只做接线。
 *
 * [新增] 顶部「专家与运行状态行」：专家识别色署名 + 运行状态 chip
 * （待裁决琥珀/执行中绿）+ 任务控制入口——审批注意力层的页内投影。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { useTranslation } from '@/i18n'
import { useQueryClient } from '@tanstack/react-query'

import { useChat } from '@/hooks/useChat'
import { useSessionRestore } from '@/hooks/useSessionRestore'
import { useRunPolling } from '@/hooks/useRunPolling'
import { useChatSessionHandoff, usePendingMessageRetry } from '@/hooks/chat/useChatSession'
import { useTaskStore } from '@/store/taskStore'
import { useUserStore } from '@/store/userStore'
import { useAppUIStore } from '@/store/appUIStore'
import { pushToast } from '@/components/ui/use-toast'
import { useChatStore } from '@/store/chatStore'
import { useAgentsQuery } from '@/hooks/queries/useAgentsQuery'
import { chatHistoryKeys } from '@/hooks/queries/useChatHistoryQuery'
import { artifactsKeys } from '@/hooks/queries/useArtifactsQuery'
import type { ChatDocument } from '@/components/chat/types'
import ChatStreamPanel from '@/components/chat/ChatStreamPanel'
import { SYSTEM_AGENTS } from '@/constants/agents'
import { agentDotStyle, expertDisplayName } from '@/lib/expertIdentity'
import { cn } from '@/lib/utils'

interface WorkbenchChatCoreProps {
  /** null = 新会话（线程由首条消息创建，经 onNewConversation 回写 URL） */
  threadId: string | null
}

export function WorkbenchChatCore({ threadId }: WorkbenchChatCoreProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const location = useLocation()

  // URL ?agentId 优先（从资源库/首页带专家进入），否则默认助手
  const agentIdParam = searchParams.get('agentId')
  const normalizedAgentId = agentIdParam || SYSTEM_AGENTS.DEFAULT_CHAT

  // 新建会话发送中（首条消息 navigate 过来）不清流——与 UnifiedChatPage
  // 同守卫：restore 只对"进入已有会话"生效
  const routeNavState = location.state as { isNew?: boolean } | null
  const isNewConversation = routeNavState?.isNew ?? false

  // 切换线程清残留（restore 前的干净起点；与 UnifiedChatPage 同款）
  useEffect(() => {
    if (threadId) {
      const currentId = useChatStore.getState().currentConversationId
      if (currentId !== threadId) {
        useChatStore.getState().setMessages([])
        useTaskStore.getState().resetAll()
        useChatStore.getState().setCurrentConversationId(threadId)
      }
    }
  }, [threadId])

  // ===== 聊天编排（与 UnifiedChatPage 同序列） =====
  const {
    inputMessage: inputValue,
    isStreaming,
    sendMessage,
    stopGeneration,
    detachActiveStream,
    resumeExecution,
    regenerate,
    setInputMessage: setInputValue,
  } = useChat({ threadUrlBase: '/workbench' })

  const { isRestored, isLatestRunControllable, latestRunId, restore: restoreSession } =
    useSessionRestore({ enabled: !!threadId && !isNewConversation })

  // 挂断在途流（真实线程切换时）：只 abort 前端 SSE——服务端任务继续跑完，
  // 回来时 restore/轮询接管现场，绝不 cancelRun（用户主动停止才真取消）；
  // 旧流的回调另有归属守卫兜底丢弃事件
  const prevThreadIdRef = useRef<string | null>(null)
  useEffect(() => {
    const prevThreadId = prevThreadIdRef.current
    prevThreadIdRef.current = threadId
    if (prevThreadId !== null && prevThreadId !== threadId) {
      detachActiveStream()
    }
  }, [threadId, detachActiveStream])

  const { startPolling, stopPolling, isPolling, currentStatus: pollingStatus, isHITLPaused, isTerminal, hasError } =
    useRunPolling({ enabled: true })

  const activeRunId = useTaskStore(state => state.activeRunId)

  const handleStopGeneration = useCallback(() => {
    stopPolling()
    stopGeneration()
  }, [stopPolling, stopGeneration])

  const { resetTerminalRefresh } = useChatSessionHandoff({
    threadId: threadId ?? '',
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

  // 模板等外部入口带入的开场白（location.state.startWith）：一次性预填输入框
  const routeState = location.state as { startWith?: string } | null
  useEffect(() => {
    if (routeState?.startWith) setInputValue(routeState.startWith)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key])

  // v3.4.7 图片输入：当前轮随消息发送的图片（dataURL）
  const [pendingImages, setPendingImages] = useState<string[]>([])
  const [pendingDocs, setPendingDocs] = useState<ChatDocument[]>([])

  const handleSend = useCallback(() => {
    if ((!inputValue.trim() && !pendingImages.length) || isStreaming) return
    // 未登录：先唤起登录（保留输入内容，登录后继续）
    if (!useUserStore.getState().isAuthenticated) {
      useAppUIStore.getState().openLogin()
      pushToast({ title: t('loginRequired') || '请先登录' })
      return
    }
    sendMessage(inputValue, normalizedAgentId, pendingImages, pendingDocs).then(() => {
      // 刷新地层 + 本线程产物投影
      queryClient.invalidateQueries({ queryKey: chatHistoryKeys.lists() })
      if (threadId) queryClient.invalidateQueries({ queryKey: artifactsKeys.threadList(threadId) })
    })
    setInputValue('')
    setPendingImages([])
    setPendingDocs([])
  }, [inputValue, pendingImages, isStreaming, sendMessage, normalizedAgentId, queryClient, threadId])

  const handleInputChange = useCallback(
    (value: string) => setInputValue(value),
    [setInputValue]
  )
  const handleRegenerate = useCallback(
    (messageId: string | number) => regenerate(messageId),
    [regenerate]
  )
  const handleRefreshSession = useCallback(() => {
    resetTerminalRefresh()
    restoreSession()
  }, [resetTerminalRefresh, restoreSession])

  // 稳定 props 对象（避免 ChatStreamPanel 无谓重渲染，沿用 UnifiedChatPage 手法）
  const chatStreamInput = useMemo(
    () => ({ value: inputValue, onChange: handleInputChange }),
    [inputValue, handleInputChange]
  )
  const chatStreamActions = useMemo(
    () => ({ onSend: handleSend, onStop: handleStopGeneration, onRegenerate: handleRegenerate }),
    [handleSend, handleStopGeneration, handleRegenerate]
  )
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

  // ===== 专家与运行状态行 =====
  const { data: agents } = useAgentsQuery({ includeDefault: true })
  const currentAgent = agents?.find(a => a.id === normalizedAgentId)
  const expertName = currentAgent?.name || expertDisplayName(normalizedAgentId)
  const agentDot = agentDotStyle(normalizedAgentId)

  const runIdForControl = activeRunId || latestRunId || threadId
  const isAwaiting = isHITLPaused || pollingStatus === 'waiting_for_approval'
  const isRunning =
    isPolling && !isAwaiting && pollingStatus && ['running', 'queued', 'resuming'].includes(pollingStatus)

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-surface-page">
      {/* 专家与运行状态行（居中对齐对话列） */}
      <div className="mx-auto flex w-full max-w-[760px] items-center gap-2 px-6 pt-4">
        <span className="flex items-center gap-1.5 text-xs text-content-secondary">
          <span
            className={cn(
              'inline-block h-2 w-2 rounded-full',
              !agentDot && 'bg-content-muted/40'
            )}
            style={agentDot ?? undefined}
          />
          <span className="font-medium">{expertName}</span>
        </span>
        <div className="flex-1" />
        {isAwaiting && (
          <span className="flex items-center gap-1 rounded-full bg-accent-warning/12 px-2 py-0.5 text-nano font-medium text-accent-warning">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-warning" />
            {t('chipAwaiting')}
          </span>
        )}
        {isRunning && (
          <span className="flex items-center gap-1 rounded-full bg-status-online/12 px-2 py-0.5 text-nano font-medium text-status-online">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-status-online" />
            {t('chipRunning')}
          </span>
        )}
        {runIdForControl && (isAwaiting || isRunning) && (
          <button
            onClick={() => navigate(`/run/${runIdForControl}`)}
            className="text-nano text-content-secondary underline-offset-2 transition-colors hover:text-content-primary hover:underline"
          >
            {t('taskControlTitle')} ›
          </button>
        )}
      </div>

      {/* 对话流（消息自取 store，含输入台/审批卡/HITL 状态条） */}
      <ChatStreamPanel
        input={chatStreamInput}
        images={pendingImages}
        documents={pendingDocs}
        onDocumentsSelected={setPendingDocs}
        onRemoveDocument={(index: number) => setPendingDocs(prev => prev.filter((_, i) => i !== index))}
        onImagesSelected={setPendingImages}
        onRemoveImage={(index: number) => setPendingImages(prev => prev.filter((_, i) => i !== index))}
        actions={chatStreamActions}
        resumeExecution={resumeExecution}
        polling={chatStreamPolling}
      />
    </div>
  )
}
