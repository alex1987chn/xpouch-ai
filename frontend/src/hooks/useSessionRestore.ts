/**
* 会话恢复 Hook
* 支持页面加载自动恢复和 visibilitychange 唤醒恢复
* 
* @features
* - 页面加载时自动恢复（初始恢复）
* - visibilitychange 事件监听（标签页切换恢复）
* - 5 秒防抖机制（防止重复恢复）
* - 检测活跃的 SSE 连接，避免重复恢复
* 
* @design
* - 单一职责：仅负责恢复会话数据
* - 轮询逻辑由 useRunPolling 独立处理
* - 组件层负责组合两个 Hook
*/

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from '@/i18n'
import { useTaskStore } from '@/store/taskStore'
import { useChatStore } from '@/store/chatStore'
import { logger } from '@/utils/logger'
import { getThread } from '@/services/chat'
import { getRunTimeline } from '@/services/runs'
import { chatHistoryKeys } from '@/hooks/queries/useChatHistoryQuery'
import { toLocalDate } from '@/lib/datetime'
import {
  buildThinkingStepsFromTimeline,
  type ThinkingStepLabels,
} from '@/lib/thinkingStepsFromTimeline'
import type { Thread, Message, SubTask } from '@/types'

interface UseSessionRestoreOptions {
  /** 是否启用恢复 */
  enabled?: boolean
  /** 恢复完成后回调 */
  onRestored?: () => void
}

/** 消息时间戳（number=毫秒；string 按后端约定 naive UTC 解析）→ 毫秒 */
function messageTimeMs(ts: number | string | undefined): number {
  if (typeof ts === 'number') return ts
  if (!ts) return 0
  return toLocalDate(ts).getTime()
}

/**
 * 用运行事件账本给最后一条助手消息补回「思考过程」步骤骨架。
 *
 * 背景：思考步骤只活在前端内存（流式期间由 SSE 事件拼出），服务端只持久化正文，
 * 所以刷新后面板必然消失。骨架一直躺在事件账本里，这里取回来挂上即可
 * （映射规则与差异见 lib/thinkingStepsFromTimeline）。
 *
 * 只在「这条助手消息确实由本次 run 产出」时挂：run 开始时间晚于消息时间的，
 * 说明那是上一轮的消息（本轮还在规划/等审批，还没有产出）。
 * 取数失败一律静默降级——面板没有就没有，绝不因为一次额外请求影响会话恢复。
 */
async function attachThinkingFromTimeline(
  messages: Message[],
  run: { id: string; started_at?: string | null } | null | undefined,
  labels: ThinkingStepLabels,
): Promise<Message[]> {
  if (!run?.id || !run.started_at) return messages

  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')
  if (!lastAssistant) return messages
  if ((lastAssistant.metadata?.thinking?.length ?? 0) > 0) return messages
  if (messageTimeMs(lastAssistant.timestamp) < toLocalDate(run.started_at).getTime()) return messages

  try {
    const timeline = await getRunTimeline(run.id, 200)
    const steps = buildThinkingStepsFromTimeline(timeline.events ?? [], labels)
    if (steps.length === 0) return messages
    logger.debug('[useSessionRestore] 已从事件账本重建思考步骤:', steps.length, '步')
    return messages.map((m) =>
      m === lastAssistant ? { ...m, metadata: { ...m.metadata, thinking: steps } } : m,
    )
  } catch (error) {
    logger.warn('[useSessionRestore] 思考步骤重建失败（面板留空，不影响会话恢复）:', error)
    return messages
  }
}

interface UseSessionRestoreReturn {
  /** 是否正在恢复 */
  isRestoring: boolean
  /** 是否已恢复 */
  isRestored: boolean
  /** 恢复错误 */
  error: Error | null
  /** 会话在服务端不存在（已删除 / 链接有误）：界面应给出明确状态而非空页面 */
  isMissingSession: boolean
  /** 手动触发恢复 */
  restore: (force?: boolean) => Promise<void>
  /** 最新运行是否处于可控制状态（running/resuming/waiting_for_approval） */
  isLatestRunControllable: boolean
  /** 最新运行实例 ID */
  latestRunId: string | null
}

function isStatusError(error: unknown): error is { status?: number } {
  return typeof error === 'object' && error !== null && 'status' in error
}

/**
 * 会话恢复 Hook
 *
 * 恢复流程（localStorage 缓存副本已随「删本地副本」清理移除）：
 * 1. 从服务端获取会话详情（404 先静默重试一次再定性）
 * 2. 以服务端数据校准 UI（消息、审批卡、运行状态）
 *
 * @description
 * 同时支持两种恢复场景：
 * - 页面刷新后恢复（useEffect 初始触发）
 * - 标签页切换后恢复（visibilitychange 事件）
 */
export function useSessionRestore(
  options: UseSessionRestoreOptions = {}
): UseSessionRestoreReturn {
  const { enabled = true, onRestored } = options
  const { id: threadId } = useParams<{ id: string }>()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  
  const [isRestoring, setIsRestoring] = useState(false)
  const [isRestored, setIsRestored] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [isLatestRunControllable, setIsLatestRunControllable] = useState(false)
  const [latestRunId, setLatestRunId] = useState<string | null>(null)
  /**
   * 会话在服务端不存在（已删除 / 链接有误）。
   *
   * 为什么要单独立一个状态：以前这里把「会话不存在（404）」和「新会话还没建好」当成同一件事，
   * 两者都是一句 debug 日志然后**停在空页面**——用户看到的就是「打开怎么是首页」，
   * 既没有解释也不会重试（2026-09-13 用户报的现象，与坏路径回首页是同一族）。
   */
  const [isMissingSession, setIsMissingSession] = useState(false)
  
  // 防抖相关 refs
  const lastRestoreTimeRef = useRef(0)
  const hasActiveStreamRef = useRef(false)
  
  // 从 Store 获取状态（使用 Selectors 模式）
  const resetAll = useTaskStore((state) => state.resetAll)
  const setPendingPlan = useTaskStore((state) => state.setPendingPlan)
  const setMode = useTaskStore((state) => state.setMode)
  const setActiveRunId = useTaskStore((state) => state.setActiveRunId)
  const clearActiveRunId = useTaskStore((state) => state.clearActiveRunId)
  const addMessage = useChatStore((state) => state.addMessage)
  const setMessages = useChatStore((state) => state.setMessages)
  const setCurrentThreadId = useChatStore((state) => state.setCurrentThreadId)
  const setGenerating = useChatStore((state) => state.setGenerating)

  /**
   * 核心恢复逻辑
   * 支持两种触发方式：初始加载 和 visibilitychange
   * @param force 是否强制恢复（跳过防抖）
   */
  const performRestore = useCallback(async (force: boolean = false): Promise<boolean> => {
    if (!threadId || !enabled) {
      return false
    }

    // 防抖检查：5 秒内不重复恢复（强制模式跳过）
    const now = Date.now()
    if (!force && now - lastRestoreTimeRef.current < 5000) {
      return false
    }
    
    // 检查是否有活跃的 SSE 连接（强制模式跳过）
    const chatStore = useChatStore.getState()
    if (!force && chatStore.isGenerating) {
      hasActiveStreamRef.current = true
      return false
    }
    
    // 如果页面隐藏前有活跃流，但现在 isGenerating 为 false
    // 说明可能是浏览器后台节流导致的连接中断
    if (hasActiveStreamRef.current) {
      hasActiveStreamRef.current = false
    }

    lastRestoreTimeRef.current = now
    setIsRestoring(true)
    setError(null)
    // 每次恢复都先清掉上一轮的「会话不存在」结论：用户可能是在重试，或切到了别的会话
    setIsMissingSession(false)

    try {
      // 从服务端获取会话详情
      //
      // 404 先静默重试一次再定性：首条消息刚落库、线程刚创建的那一瞬间，这个 GET 仍可能
      // 撞上 404（同一进程内的写入可见性 + 网络往返差），把它当成「会话不存在」会误报。
      // 重试仍 404 才交给外层 catch 定性（那里会给用户一个明确状态，见 isMissingSession）。
      let thread: Thread
      try {
        thread = await getThread(threadId)
      } catch (err) {
        if (!(isStatusError(err) && err.status === 404)) throw err
        logger.debug('[useSessionRestore] 会话详情 404，1.2s 后重试一次')
        await new Promise(resolve => setTimeout(resolve, 1200))
        thread = await getThread(threadId)
      }
      const latestRun = thread.latest_run

      // 🔥 恢复消息（无论简单模式还是复杂模式）
      if (thread.messages && thread.messages.length > 0) {
        // 🔥🔥🔥 前端排序：按 timestamp 升序。走 messageTimeMs（naive-UTC 解析口径），
        // 与本文件其余时间处理一致——裸 new Date() 一旦混入带时区的实时时间戳会错序（评审低危 L5）
        const sortedMessages = [...thread.messages].sort(
          (a, b) => messageTimeMs(a.timestamp) - messageTimeMs(b.timestamp)
        )
        // 思考面板随刷新消失（步骤只在内存里）→ 从事件账本重建骨架挂回
        const restoredMessages = await attachThinkingFromTimeline(sortedMessages, latestRun, {
          // 步骤署名与实时面板同一词条（评审 M8：不再硬编码中文）
          routerName: t('thinkingRouting'),
          planName: t('thinkingPlanning'),
          planDone: t('thinkingPlanDone'),
          taskDone: t('thinkingTaskDone'),
          taskFailed: t('thinkingTaskFailed'),
          // 与实时面板同一词条 + 同一 mode 文案，保证两处逐字一致
          routerDone: (mode) =>
            t('thinkingRouterDone', {
              mode: t(mode === 'simple' ? 'modeSimple' : 'modeComplex'),
            }),
        })
        setMessages(restoredMessages)
      }
      setCurrentThreadId(threadId)

      // 刚拿到这条会话的真相（含 latest_run.status）→ 让会话地层跟着对账一次。
      // 侧栏状态 chip 读的正是 latest_run.status，而这个状态可能在别处变过
      // （另一个标签页/任务控制页取消），本客户端此前没有任何时机知道。
      queryClient.invalidateQueries({ queryKey: chatHistoryKeys.lists() })

      const latestRunStatus = latestRun?.status

      // 🔥🔥🔥 关键修复：使用 completed_at 判断任务是否真正完成
      // 避免状态同步延迟导致的"假 running"问题
      const isRunActuallyCompleted = !!latestRun?.completed_at
      // 「可控」= 还需要前端接管现场（轮询 / 等审批）
      const isLatestRunControllable =
        !isRunActuallyCompleted && (
          latestRunStatus === 'running' ||
          latestRunStatus === 'resuming' ||
          latestRunStatus === 'waiting_for_approval'
        )
      // 「生成中」只对**真的在跑**的 run 成立：审批等待是等人，不是生成。
      // 这里曾对全部「可控」状态都 setGenerating(true)，后果是刷新后点「批准」
      // 被 resumeExecution 的防重入守卫（它看 isGenerating）在本地挡掉——报
      // 「已有请求正在进行，请稍后再试」，请求根本没发出去，任务再也起不来。
      // 不刷新时那条路径本来没问题（流收尾时 finalizeStream 会把 generating 置 false），
      // 这里与它对齐即可。卡片自身另有 isSubmitting 防连点，后端还有 in-flight 去重。
      const isRunStreaming =
        !isRunActuallyCompleted &&
        (latestRunStatus === 'running' || latestRunStatus === 'resuming')

      if (isLatestRunControllable && latestRun?.id) {
        setActiveRunId(latestRun.id)
        setGenerating(isRunStreaming)
        // 🔥 保存最新运行状态，供组件层决定是否启动轮询
        setIsLatestRunControllable(true)
        setLatestRunId(latestRun.id)
      } else {
        clearActiveRunId()
        // 🔥 确保终态时 isGenerating 为 false
        setGenerating(false)
        setIsLatestRunControllable(false)
        setLatestRunId(null)
      }
      
      // 检查是否是复杂模式（有 execution_plan）
      if (!thread.execution_plan && !thread.execution_plan_id) {
        // 简单模式：只恢复消息即可
        setIsRestored(true)
        setIsRestoring(false)
        return true
      }
      
      // 复杂模式：恢复执行状态
      //
      // 此前这里有一段「智能合并」启发式：比较**本地持久化的产物数**与 API 返回的
      // 产物数，决定用哪边重建任务表。那套逻辑存在的前提是「本地留有一份任务/产物
      // 副本」——而那份副本没有任何 UI 消费者，属于审计所称的「双真相源」。
      // 现已移除本地副本，产物/任务一律**以服务端为唯一真相**：直接设置模式与
      // 初始化标记即可（后面的 pendingPlan / 运行中判定本来就全部读 subTasks）。
      const { execution_plan } = thread
      if (execution_plan?.sub_tasks) {
        const subTasks = execution_plan.sub_tasks || []

        setMode('complex')
        
        // 检查是否还有运行中的任务
        const hasRunningTask = subTasks.some((t: SubTask) => t.status === 'running')
        const hasPendingTask = subTasks.some((t: SubTask) => t.status === 'pending')
        const isRunActive = latestRunStatus === 'running' || latestRunStatus === 'resuming'
        const isWaitingForApproval = latestRunStatus === 'waiting_for_approval'

        // 🔥🔥🔥 关键修复：使用 completed_at 判断任务是否真正完成
        // 避免状态同步延迟导致的"假 running"问题
        const isRunActuallyCompleted = !!latestRun?.completed_at

        // 🔥🔥🔥 关键修复：只在任务真正运行中且未到达终态时添加提示
        // 避免终态后仍然显示"后台任务"提示
        if ((hasRunningTask || isRunActive) && !isRunActuallyCompleted) {
          // 添加系统消息提示用户
          addMessage({
            role: 'system',
            content: t('backgroundTaskNotice'),
            timestamp: Date.now()
          })
        }
        
        // 检查会话状态是否需要用户干预（如 HITL 等待确认）
        // 🔥 方案1：从 subTasks 恢复 pendingPlan
        if (isWaitingForApproval && hasPendingTask) {
          // 从 subTasks 构建 pendingPlan
          const pendingPlan = subTasks
            .filter((t: SubTask) => t.status === 'pending')
            .map((t: SubTask, index: number) => ({
              id: t.id,
              expert_type: t.expert_type,
              description: t.description,
              sort_order: index,
              status: 'pending' as const,
              depends_on: t.depends_on || [],
              artifacts: [],
            }))

          if (pendingPlan.length > 0) {
            setPendingPlan(
              pendingPlan,
              execution_plan.plan_version || 1,
              latestRun?.id || execution_plan.run_id || null,
            )
            logger.debug('[useSessionRestore] HITL 恢复: pendingPlan 已设置', pendingPlan.length, '个任务')
          }
        }
      }

      setIsRestored(true)
      onRestored?.()

      return true
    } catch (err: unknown) {
      // 到这里还 404 = 会话在服务端真的不存在（已删除 / 链接有误）。
      //
      // 为什么不能像以前那样"静默当成功"：新会话那条路根本走不到这里——URL 还没有 threadId
      // 时 `enabled` 就是 false，performRestore 会提前返回。所以能走到 404 的只有「指向一个
      // 不存在的会话」，而静默返回的后果是页面停在空态、看起来与"打开首页"一模一样，
      // 且永远不会重试。改成显式状态（isMissingSession）让界面说清发生了什么并给出重试。
      if (isStatusError(err) && err.status === 404) {
        logger.warn('[useSessionRestore] 会话不存在或已被删除:', threadId)
        setIsMissingSession(true)
        setIsRestored(true) // 结算，避免 effect 反复重试；重试交给界面上的按钮（force）
        return false
      }

      const error = err instanceof Error ? err : new Error(String(err))
      logger.error('[useSessionRestore] 恢复失败:', error)
      setError(error)

      // 恢复失败时清空本地状态，避免显示过期数据
      resetAll()
      return false
    } finally {
      setIsRestoring(false)
    }
  }, [threadId, enabled, queryClient, setPendingPlan, setMode, setActiveRunId, clearActiveRunId, addMessage, resetAll, onRestored, setMessages, setCurrentThreadId, setGenerating, t])

  /**
   * 公开的手动恢复方法
   * @param force 是否强制恢复（跳过防抖和活跃流检查）
   */
  const restore = useCallback(async (force: boolean = false) => {
    await performRestore(force)
  }, [performRestore])

  /**
   * 初始恢复：页面加载时自动触发
   */
  useEffect(() => {
    if (enabled && threadId && !isRestored && !isRestoring) {
      performRestore()
    }
  }, [enabled, threadId, isRestored, isRestoring, performRestore])

  /**
   * visibilitychange 恢复：标签页切换时触发
   */
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // 页面隐藏时，标记是否有活跃流
        const chatStore = useChatStore.getState()
        hasActiveStreamRef.current = chatStore.isGenerating
        return
      }
      
      // 页面重新可见时触发恢复
      if (enabled && threadId) {
        performRestore()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [enabled, threadId, performRestore])

  /**
   * 清理：会话切换时重置状态
   */
  useEffect(() => {
    return () => {
      setIsRestored(false)
      setIsMissingSession(false)
      setError(null)
      lastRestoreTimeRef.current = 0
    }
  }, [threadId])

  return {
    isRestoring,
    isRestored,
    error,
    isMissingSession,
    restore,
    isLatestRunControllable,
    latestRunId,
  }
}
