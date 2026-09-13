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
 * - 终态时失效地层/产物缓存（SSE 断流后执行仍会完成，轮询是最后的对账机会），
 *   UI 响应仍由组件层决定
 * - 组件层决定如何响应终态
 *
 * @usage
 * const { startPolling, stopPolling, isPolling, currentStatus, isTerminal } = useRunPolling({
 *   enabled: true,
 * })
 */

import { useEffect, useRef, useCallback, useReducer } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getRunStatus } from '@/services/run'
import { useChatStore } from '@/store/chatStore'
import { useTaskStore } from '@/store/taskStore'
import { chatHistoryKeys } from '@/hooks/queries/useChatHistoryQuery'
import { artifactsKeys } from '@/hooks/queries/useArtifactsQuery'
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
  | { status: 'idle'; isPolling: false; isHITLPaused: false; isTerminal: false; hasError: false; runId: null }
  | { status: 'polling'; isPolling: true; isHITLPaused: false; isTerminal: false; hasError: false; runId: string }
  | { status: 'hitl_paused'; isPolling: true; isHITLPaused: true; isTerminal: false; hasError: false; runId: string }
  | { status: 'terminal'; isPolling: false; isHITLPaused: false; isTerminal: true; hasError: false; runId: string }
  | { status: 'error'; isPolling: false; isHITLPaused: false; isTerminal: true; hasError: true; runId: string }

type PollingAction =
  | { type: 'START'; runId: string }
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
  runId: null,
}

/**
 * 轮询状态机。
 *
 * `runId` 记录**本状态机当前跟踪的 run**：终态是「那个 run 的」结论，不是页面会话的
 * 结论。同一页面里换了一个 run（用户又发了新消息、任务断流后重新接管），必须允许
 * 重新起轮询——否则一次终态会把后续所有轮询永久锁死（此前 isTerminal 的静态判断
 * 就有这个问题）。因此 START 只在「同一个 run 已终态」时拒绝。
 */
export function pollingReducer(state: PollingState, action: PollingAction): PollingState {
  switch (action.type) {
    case 'START': {
      // 同一个 run 已经走到终态：无需（也无法）重启
      if (state.isTerminal && state.runId === action.runId) return state
      return {
        status: 'polling',
        isPolling: true,
        isHITLPaused: false,
        isTerminal: false,
        hasError: false,
        runId: action.runId,
      }
    }

    case 'STOP':
      if (state.status === 'idle') return state
      return initialState

    case 'HITL_PAUSED':
      if (state.status !== 'polling') return state
      return { status: 'hitl_paused', isPolling: true, isHITLPaused: true, isTerminal: false, hasError: false, runId: state.runId }

    case 'HITL_RESUMED':
      if (state.status !== 'hitl_paused') return state
      return { status: 'polling', isPolling: true, isHITLPaused: false, isTerminal: false, hasError: false, runId: state.runId }

    case 'TERMINAL_REACHED':
      if (state.isTerminal || !state.runId) return state
      return { status: 'terminal', isPolling: false, isHITLPaused: false, isTerminal: true, hasError: false, runId: state.runId }

    case 'ERROR_OCCURRED':
      if (!state.runId) return state
      return { status: 'error', isPolling: false, isHITLPaused: false, isTerminal: true, hasError: true, runId: state.runId }

    case 'RESET':
      return initialState

    default:
      return state
  }
}

/**
 * 轮询状态是否「失去了输入」（有轮询状态，但没有 run 可轮询）。
 *
 * 为什么需要这条不变量：轮询的唯一输入是 store 里的 `activeRunId`（查询 enabled
 * 与 queryKey 都靠它）。而清掉 activeRunId 的路径不止一条——`resetAll()`（新建会话、
 * 切线程）里就会置空——停轮询却只有「恢复交接」那一条路（`useChatSessionHandoff`
 * 的「没有可控任务」分支）。于是新建会话时会出现：状态机还在 `polling`，
 * runId 已经没了 → 查询被禁用、状态永远取不到 → 底部一直显示
 * 「正在恢复任务连接…(Unknown)」的假加载条，直到整页刷新。
 * （实测复现：会话 A 停在审批等待且不点，刷新后点「新建会话」。）
 *
 * 把它写成纯判定是为了能直接单测——这类「生命周期错配」的坑在 UI 上极难一眼看出。
 */
export function isPollingOrphaned(
  state: PollingState,
  activeRunId: string | null | undefined
): boolean {
  return state.isPolling && !activeRunId
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
  const queryClient = useQueryClient()

  // 跟踪状态变化（用于日志）
  const previousStatusRef = useRef<RunStatus | null>(null)
  const consecutiveErrorsRef = useRef(0)

  const setGenerating = useChatStore((state) => state.setGenerating)
  const clearActiveRunId = useTaskStore((state) => state.clearActiveRunId)
  const clearPendingPlan = useTaskStore((state) => state.clearPendingPlan)

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
        // 断流兜底：SSE 已断时执行仍会在服务端完成，轮询是最后对账点
        queryClient.invalidateQueries({ queryKey: chatHistoryKeys.lists() })
        queryClient.invalidateQueries({ queryKey: artifactsKeys.all })
        // 审批卡必须跟着 run 一起收场：run 在别处被驳回/取消/超时（另一个标签页、
        // 任务控制页、清理服务）时这里才发现，而卡片此前没有任何机制会被撤下——
        // 用户看到一张点不动的卡（批准还会失败），这是实测踩到过的坑。
        if (useTaskStore.getState().isWaitingForApproval) {
          logger.info('[useRunPolling] run 已终态，撤下过期的审批卡')
          clearPendingPlan()
        }
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
  }, [data, activeRunId, state.isTerminal, state.status, setGenerating, clearActiveRunId, clearPendingPlan, queryClient])

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

    // 同一 run 已终态 → 跳过；换了一个 run → 允许（reducer 内部按 runId 判定）
    if (state.isTerminal && state.runId === currentRunId) {
      logger.info('[useRunPolling] 该 run 已是终态，跳过轮询启动:', { runId: currentRunId })
      return
    }

    logger.info('[useRunPolling] 启动轮询:', { runId: currentRunId })
    dispatch({ type: 'START', runId: currentRunId })
    consecutiveErrorsRef.current = 0
    previousStatusRef.current = null
    refetchRef.current()
  }, [enabled, state.isTerminal, state.runId])

  const stopPolling = useCallback(() => {
    if (state.status === 'idle') return
    logger.info('[useRunPolling] 停止轮询')
    dispatch({ type: 'STOP' })
  }, [state.status])

  // 失去输入就停：轮询状态还在、但 run 已经被清掉（新建会话 / 切线程 / 别处 reset），
  // 此时查询永远取不到状态，只会留一条假的「正在恢复任务连接」加载条。见
  // isPollingOrphaned 的注释（实测复现路径写在那里）。
  useEffect(() => {
    if (isPollingOrphaned(state, activeRunId)) {
      logger.warn('[useRunPolling] 轮询状态存在但 activeRunId 已清空，停止轮询（避免假加载条）')
      stopPolling()
    }
  }, [state, activeRunId, stopPolling])

  // 清理：**仅**组件卸载时停止轮询。
  //
  // 这里必须用空依赖 + ref（不能把 isPolling / stopPolling 放进依赖数组）：
  // 那种写法会让 cleanup 在每次依赖变化时都跑一遍，而 cleanup 里判的是**闭包里那个
  // 旧的** isPolling——于是 HITL 暂停（status 变化 → stopPolling 换引用 → 跑一次
  // cleanup，此时旧闭包里 isPolling 还是 true）会把刚暂停的轮询直接停成 idle。
  // 后果不只是界面：审批在**别的标签页/任务控制页**被处理时，本页没人轮询，
  // 「run 在别处收场 → 撤下过期审批卡」这条兜底就永远不会触发。
  const isPollingRef = useRef(state.isPolling)
  isPollingRef.current = state.isPolling
  const stopPollingRef = useRef(stopPolling)
  stopPollingRef.current = stopPolling
  useEffect(() => {
    return () => {
      if (isPollingRef.current) {
        stopPollingRef.current()
      }
    }
  }, [])

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
