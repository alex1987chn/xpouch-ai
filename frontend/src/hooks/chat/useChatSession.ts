/**
 * 会话生命周期编排（v3.4.4 自 UnifiedChatPage 纯搬入，逻辑不变）
 *
 * 职责：恢复→轮询的交接、终态单次刷新、登录后待发消息重发。
 * 注意：初始消息的 300ms 延迟发送是 StrictMode 首挂丢弃机制的一部分
 * （cleanup 清 timer 丢弃第一遍），属承载性时序，勿"优化"为同步发送。
 */

import { useCallback, useEffect, useRef } from 'react'
import { useChatStore } from '@/store/chatStore'
import { logger } from '@/utils/logger'

interface PollingHandoffParams {
  threadId: string
  isRestored: boolean
  isLatestRunControllable: boolean
  latestRunId: string | null | undefined
  activeRunId: string | null | undefined
  isTerminal: boolean
  startPolling: () => void
  stopPolling: () => void
  restoreSession: () => void
}

/**
 * 恢复完成后安全启动轮询；终态时单次刷新数据。
 * 返回 resetTerminalRefresh：手动刷新时绕过"终态只刷一次"防抖。
 */
export function useChatSessionHandoff({
  threadId,
  isRestored,
  isLatestRunControllable,
  latestRunId,
  activeRunId,
  isTerminal,
  startPolling,
  stopPolling,
  restoreSession,
}: PollingHandoffParams): { resetTerminalRefresh: () => void } {
  // 🔥 核心组合逻辑：会话恢复完成后，安全启动轮询
  useEffect(() => {
    // 等待会话恢复完成
    if (!isRestored) return

    // 检查是否有可控制的任务
    if (!isLatestRunControllable || !latestRunId) {
      // 没有运行中的任务，确保停止轮询
      stopPolling()
      return
    }

    // 检查 store 中的 activeRunId 是否已同步
    if (activeRunId !== latestRunId) {
      // store 还未同步，等待
      return
    }

    // 🔥🔥🔥 关键修复：如果已经检测到终态，不要重新启动轮询
    // 这发生在：轮询检测到终态 -> restoreSession() -> 但后端状态仍显示 running
    // 此时如果启动轮询，会重置 isTerminal，导致终态检测失效
    if (isTerminal) {
      logger.info('[UnifiedChatPage] 已检测到终态，跳过轮询启动')
      return
    }

    // 🔥 所有条件满足，安全启动轮询
    logger.info('[UnifiedChatPage] 恢复完成，启动轮询:', { latestRunId, activeRunId })
    startPolling()
  }, [isRestored, isLatestRunControllable, latestRunId, activeRunId, isTerminal, startPolling, stopPolling])

  // 🔥 终态时刷新数据（防抖：只触发一次；会话切换或手动刷新时重置标记）
  const hasRefreshedRef = useRef(false)
  useEffect(() => {
    hasRefreshedRef.current = false
  }, [threadId])

  const resetTerminalRefresh = useCallback(() => {
    hasRefreshedRef.current = false
  }, [])

  useEffect(() => {
    if (!isTerminal || hasRefreshedRef.current) return

    logger.info('[UnifiedChatPage] 检测到终态，刷新数据')
    hasRefreshedRef.current = true
    restoreSession()
  }, [isTerminal, restoreSession])

  return { resetTerminalRefresh }
}

/**
 * 登录后自动重发 pendingMessage（Store Trigger 模式）。
 * 用 ref 持有最新回调，避免 subscribe 闭包过期。
 */
export function usePendingMessageRetry(
  sendMessage: (content: string, agentId?: string) => Promise<unknown>,
  normalizedAgentId: string,
  isStreaming: boolean
): void {
  const sendMessageRef = useRef(sendMessage)
  sendMessageRef.current = sendMessage

  const normalizedAgentIdRef = useRef(normalizedAgentId)
  normalizedAgentIdRef.current = normalizedAgentId

  useEffect(() => {
    const unsubscribe = useChatStore.subscribe((state, prevState) => {
      // 当 shouldRetrySend 从 false 变为 true 时触发
      if (state.shouldRetrySend && !prevState.shouldRetrySend && state.pendingMessage && !isStreaming) {
        const currentSendMessage = sendMessageRef.current
        const currentAgentId = normalizedAgentIdRef.current

        currentSendMessage(state.pendingMessage, currentAgentId)
          .then(() => {
            useChatStore.getState().setPendingMessage(null)
            useChatStore.getState().setShouldRetrySend(false)
          })
          .catch((err) => {
            logger.error('[UnifiedChatPage] 消息重发失败:', err)
            useChatStore.getState().setShouldRetrySend(false)
            // 如果还是 401，会再次触发登录弹窗，pendingMessage 保留
          })
      }
    })

    return () => unsubscribe()
  }, [isStreaming])
}
