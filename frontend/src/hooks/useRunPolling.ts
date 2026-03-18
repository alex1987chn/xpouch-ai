/**
 * 运行状态轮询 Hook (State Machine 重构版)
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
 * - 使用 State Machine 管理轮询生命周期
 * - 终态时仅通知，不主动刷新数据
 * - 组件层决定如何响应终态
 *
 * @usage
 * const { startPolling, stopPolling, isPolling, currentStatus, isTerminal } = useRunPolling({
 *   enabled: true,
 * })
 */

import { useEffect, useRef, useCallback, useReducer } from 'react'
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

// ==================== State Machine 定义 ====================

type PollingState =
  | { status: 'idle'; isPolling: false; isHITLPaused: false; isTerminal: false; hasError: false }
  | { status: 'polling'; isPolling: true; isHITLPaused: false; isTerminal: false; hasError: false }
  | { status: 'hitl_paused'; isPolling: true; isHITLPaused: true; isTerminal: false; hasError: false }
  | { status: 'terminal'; isPolling: false; isHITLPaused: false; isTerminal: true; hasError: false }
  | { status: 'error'; isPolling: false; isHITLPaused: false; isTerminal: true; hasError: true }

type PollingAction =
  | { type: 'START' }
  | { type: 'STOP' }
  | { type: 'HITL_PAUSED' }
  | { type: 'HITL_RESUMED' }
  | { type: 'TERMINAL_REACHED' }
  | { type: 'ERROR_OCCURRED' }
  | { type: 'RESET' }

const initialState: PollingState = {
  status: 'idle',
  isPolling: false,
  isHITLPaused: false,
  isTerminal: false,
  hasError: false,
}

function pollingReducer(state: PollingState, action: PollingAction): PollingState {
  switch (action.type) {
    case 'START':
      // 终态不允许重新启动
      if (state.isTerminal) return state
      return { status: 'polling', isPolling: true, isHITLPaused: false, isTerminal: false, hasError: false }

    case 'STOP':
      if (state.status === 'idle') return state
      return { status: 'idle', isPolling: false, isHITLPaused: false, isTerminal: false, hasError: false }

    case 'HITL_PAUSED':
      if (state.status !== 'polling') return state
      return { status: 'hitl_paused', isPolling: true, isHITLPaused: true, isTerminal: false, hasError: false }

    case 'HITL_RESUMED':
      if (state.status !== 'hitl_paused') return state
      return { status: 'polling', isPolling: true, isHITLPaused: false, isTerminal: false, hasError: false }

    case 'TERMINAL_REACHED':
      if (state.isTerminal) return state
      return { status: 'terminal', isPolling: false, isHITLPaused: false, isTerminal: true, hasError: false }

    case 'ERROR_OCCURRED':
      return { status: 'error', isPolling: false, isHITLPaused: false, isTerminal: true, hasError: true }

    case 'RESET':
      return initialState

    default:
      return state
  }
}

// ==================== Hook 定义 ====================

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
  const [state, dispatch] = useReducer(pollingReducer, initialState)

  // 跟踪状态变化（用于日志）
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
    enabled: enabled && !!activeRunId && state.isPolling,
    refetchInterval: state.isPolling && !state.isHITLPaused ? POLLING_INTERVAL : false,
    refetchIntervalInBackground: true,
    retry: 1,
    retryDelay: 1000,
  })

  // 🔥 P0 修复：使用 ref 存储最新的 refetch，绕过 useCallback 闭包陷阱
  const refetchRef = useRef(refetch)
  refetchRef.current = refetch

  // ==================== 状态机驱动逻辑 ====================

  // 核心：数据驱动状态机流转
  useEffect(() => {
    if (!data) return

    const { status } = data

    // 记录状态变化日志
    if (status !== previousStatusRef.current) {
      logger.info('[useRunPolling] 状态变化:', {
        runId: activeRunId,
        from: previousStatusRef.current,
        to: status,
      })
      previousStatusRef.current = status
    }

    // 终态检测（最高优先级）
    if (TERMINAL_STATUSES.includes(status)) {
      if (!state.isTerminal) {
        logger.info('[useRunPolling] 终态，停止轮询:', status)
        dispatch({ type: 'TERMINAL_REACHED' })
        setGenerating(false)
        clearActiveRunId()
      }
      return
    }

    // HITL 状态检测
    if (status === HITL_STATUS) {
      if (state.status === 'polling') {
        logger.info('[useRunPolling] HITL 状态，暂停轮询')
        dispatch({ type: 'HITL_PAUSED' })
      }
      return
    }

    // 从 HITL 恢复
    if (state.status === 'hitl_paused' && status !== HITL_STATUS) {
      logger.info('[useRunPolling] 从 HITL 恢复，继续轮询')
      dispatch({ type: 'HITL_RESUMED' })
    }
  }, [data, activeRunId, state.isTerminal, state.status, setGenerating, clearActiveRunId])

  // 错误处理
  useEffect(() => {
    if (!error) return

    consecutiveErrorsRef.current += 1
    logger.error('[useRunPolling] 轮询错误:', error, `连续错误: ${consecutiveErrorsRef.current}`)

    // 404 或连续错误过多时停止轮询
    const isRunNotFound = error instanceof Error && error.message === 'RUN_NOT_FOUND'
    const shouldStop = isRunNotFound || consecutiveErrorsRef.current >= MAX_CONSECUTIVE_ERRORS

    if (shouldStop && state.status !== 'error') {
      logger.warn('[useRunPolling] 停止轮询：错误条件满足')
      dispatch({ type: 'ERROR_OCCURRED' })
      setGenerating(false)
      clearActiveRunId()
    }
  }, [error, state.status, setGenerating, clearActiveRunId])

  // ==================== 外部控制接口 ====================

  const startPolling = useCallback(() => {
    const currentRunId = useTaskStore.getState().activeRunId
    if (!currentRunId || !enabled) {
      logger.warn('[useRunPolling] 无法启动轮询：activeRunId 或 enabled 无效')
      return
    }

    if (state.isTerminal) {
      logger.info('[useRunPolling] 已经是终态，跳过轮询启动')
      return
    }

    logger.info('[useRunPolling] 启动轮询:', { runId: currentRunId })
    dispatch({ type: 'START' })
    consecutiveErrorsRef.current = 0
    previousStatusRef.current = null
    refetchRef.current()
  }, [enabled, state.isTerminal])

  const stopPolling = useCallback(() => {
    if (state.status === 'idle') return
    logger.info('[useRunPolling] 停止轮询')
    dispatch({ type: 'STOP' })
  }, [state.status])

  // 清理：组件卸载时停止轮询
  useEffect(() => {
    return () => {
      if (state.isPolling) {
        stopPolling()
      }
    }
  }, [state.isPolling, stopPolling])

  return {
    startPolling,
    stopPolling,
    isPolling: state.isPolling,
    currentStatus: data?.status ?? null,
    isHITLPaused: state.isHITLPaused,
    isTerminal: state.isTerminal,
    hasError: state.hasError,
  }
}
