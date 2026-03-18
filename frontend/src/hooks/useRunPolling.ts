/**
 * 运行状态轮询 Hook
 *
 * @features
 * - 3 秒轮询间隔
 * - HITL 状态（waiting_for_approval）暂停轮询
 * - 无硬上限，持续轮询直到终态
 * - 后台轮询（标签页切换后继续）
 * - 直接从 store 读取 activeRunId
 * - 单一职责：仅负责轮询状态，不处理数据刷新
 * - 错误处理：404 或连续错误时停止轮询
 *
 * @design
 * - 终态时仅通知，不主动刷新数据
 * - 组件层决定如何响应终态
 *
 * @usage
 * const { startPolling, stopPolling, isPolling, currentStatus, isTerminal } = useRunPolling({
 *   enabled: true,
 * })
 */

import { useEffect, useRef, useCallback, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getRunStatus } from '@/services/run'
import { useChatStore } from '@/store/chatStore'
import { useTaskStore } from '@/store/taskStore'
import { logger } from '@/utils/logger'
import type { RunStatus } from '@/types/run'

const POLLING_INTERVAL = 3000 // 3 秒
const MAX_CONSECUTIVE_ERRORS = 3 // 最大连续错误次数

/** 终态列表 */
const TERMINAL_STATUSES: RunStatus[] = ['completed', 'failed', 'cancelled', 'timed_out']

/** HITL 状态（暂停轮询） */
const HITL_STATUS: RunStatus = 'waiting_for_approval'

interface UseRunPollingOptions {
  /** 是否启用轮询 */
  enabled?: boolean
}

interface UseRunPollingReturn {
  /** 启动轮询 */
  startPolling: () => void
  /** 停止轮询 */
  stopPolling: () => void
  /** 是否正在轮询 */
  isPolling: boolean
  /** 当前状态 */
  currentStatus: RunStatus | null
  /** 是否处于 HITL 暂停状态 */
  isHITLPaused: boolean
  /** 是否已到达终态 */
  isTerminal: boolean
  /** 是否遇到错误 */
  hasError: boolean
}

export function useRunPolling(options: UseRunPollingOptions = {}): UseRunPollingReturn {
  const { enabled = true } = options
  const [isPolling, setIsPolling] = useState(false)
  const [isHITLPaused, setIsHITLPaused] = useState(false)
  const [isTerminal, setIsTerminal] = useState(false)
  const [hasError, setHasError] = useState(false)
  const previousStatusRef = useRef<RunStatus | null>(null)
  const consecutiveErrorsRef = useRef(0)

  const setGenerating = useChatStore((state) => state.setGenerating)
  const clearActiveRunId = useTaskStore((state) => state.clearActiveRunId)

  // 从 store 获取 activeRunId
  const activeRunId = useTaskStore((state) => state.activeRunId)

  // 使用 React Query 进行轮询
  const { data, error, refetch } = useQuery({
    queryKey: ['runStatus', activeRunId],
    queryFn: async () => {
      try {
        const result = await getRunStatus(activeRunId!)
        // 成功时重置错误计数
        consecutiveErrorsRef.current = 0
        return result
      } catch (err) {
        // 检查是否是 404 错误
        if (err instanceof Error && err.message.includes('404')) {
          logger.warn('[useRunPolling] Run 不存在 (404)，停止轮询')
          throw new Error('RUN_NOT_FOUND')
        }
        throw err
      }
    },
    enabled: enabled && !!activeRunId && isPolling,
    refetchInterval: isPolling && !isHITLPaused ? POLLING_INTERVAL : false,
    refetchIntervalInBackground: true,
    retry: 1, // 减少重试次数，快速失败
    retryDelay: 1000,
  })

  // 处理错误
  useEffect(() => {
    if (!error) return

    consecutiveErrorsRef.current += 1
    logger.error('[useRunPolling] 轮询错误:', error, `连续错误: ${consecutiveErrorsRef.current}`)

    // 404 或连续错误过多时停止轮询
    if (
      error instanceof Error && error.message === 'RUN_NOT_FOUND' ||
      consecutiveErrorsRef.current >= MAX_CONSECUTIVE_ERRORS
    ) {
      logger.warn('[useRunPolling] 停止轮询：错误条件满足')
      setIsPolling(false)
      setIsTerminal(true)
      setHasError(true)
      setGenerating(false)
      clearActiveRunId()
    }
  }, [error, setGenerating, clearActiveRunId])

  // 🔥 关键修复：初始化时检查当前状态（处理任务在组件挂载前已完成的情况）
  useEffect(() => {
    if (!data) return

    const { status } = data

    // 🔥 关键修复：如果初始状态就是终态，立即设置 isTerminal
    // 这发生在用户切出对话，任务在后台完成，然后返回会话时
    if (TERMINAL_STATUSES.includes(status) && !isTerminal) {
      logger.info('[useRunPolling] 初始状态即为终态:', status)
      setIsTerminal(true)
      setIsPolling(false)
      setIsHITLPaused(false)
      setGenerating(false)
      clearActiveRunId()
      return
    }

    // 状态变化时记录日志
    if (status !== previousStatusRef.current) {
      logger.info('[useRunPolling] 状态变化:', {
        runId: activeRunId,
        from: previousStatusRef.current,
        to: status,
      })

      previousStatusRef.current = status
    }

    // HITL 状态：暂停轮询
    if (status === HITL_STATUS) {
      setIsHITLPaused(true)
      logger.info('[useRunPolling] HITL 状态，暂停轮询')
      return
    }

    // 从 HITL 恢复：继续轮询
    if (isHITLPaused && status !== HITL_STATUS) {
      setIsHITLPaused(false)
      logger.info('[useRunPolling] 从 HITL 恢复，继续轮询')
    }

    // 终态：停止轮询，通知组件层
    if (TERMINAL_STATUSES.includes(status)) {
      logger.info('[useRunPolling] 终态，停止轮询:', status)
      setIsTerminal(true)
      setIsPolling(false)
      setIsHITLPaused(false)
      setGenerating(false)
      clearActiveRunId()
    }
  }, [data, activeRunId, isHITLPaused, setGenerating, clearActiveRunId, isTerminal])

  // 启动轮询
  const startPolling = useCallback(() => {
    const currentRunId = useTaskStore.getState().activeRunId
    if (!currentRunId || !enabled) {
      logger.warn('[useRunPolling] 无法启动轮询：activeRunId 或 enabled 无效')
      return
    }

    // 🔥🔥🔥 关键修复：如果已经是终态，不要重置状态
    // 这发生在 restoreSession() 后，但后端状态仍显示 running
    // 此时如果重置 isTerminal，会导致终态检测失效
    if (isTerminal) {
      logger.info('[useRunPolling] 已经是终态，跳过轮询启动')
      return
    }

    logger.info('[useRunPolling] 启动轮询:', { runId: currentRunId })
    setIsPolling(true)
    setIsHITLPaused(false)
    setIsTerminal(false)
    setHasError(false)
    consecutiveErrorsRef.current = 0
    previousStatusRef.current = null
    refetch()
  }, [enabled, refetch, isTerminal])

  // 停止轮询
  const stopPolling = useCallback(() => {
    logger.info('[useRunPolling] 停止轮询')
    setIsPolling(false)
    setIsHITLPaused(false)
  }, [])

  // 清理
  useEffect(() => {
    return () => {
      if (isPolling) {
        stopPolling()
      }
    }
  }, [isPolling, stopPolling])

  return {
    startPolling,
    stopPolling,
    isPolling,
    currentStatus: data?.status ?? null,
    isHITLPaused,
    isTerminal,
    hasError,
  }
}
