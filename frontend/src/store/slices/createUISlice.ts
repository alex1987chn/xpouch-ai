/**
 * UI Slice - 工作台 UI 状态
 *
 * [职责边界] 只放**有真实消费者**的 UI 状态：
 * - `mode` / `isInitialized`：simple / complex 判定与首屏初始化（ChatStreamPanel、useSessionRestore）
 * - `runningTaskIds`：正在执行的任务集合（ChatStreamPanel 的「执行中」态）
 * - `activeRunId`：当前接管运行实例（轮询、审批、恢复三处都用它）
 * - HITL 相关：`pendingPlan` / `pendingPlanVersion` / `pendingRunId` /
 *   `pendingExecutionPlanId` / `isWaitingForApproval` / `planRevising`（审批卡与恢复）
 *
 * [2026-09-13 清理] 删掉了三组**只写不读**的状态（连同它们的 action 与 selector）：
 * - `selectedTaskId` / `selectTask`：无任何消费者（资源画布走服务端查询与 threadId）
 * - `progress` / `setProgress`：写点在 task 事件处理器里，无读取方
 * - `isPolling` / `pollingStatus` / `isHITLPaused` 及其 setter：轮询状态的真身在
 *   `useRunPolling` 的状态机里，这几个字段是从未被写入过的影子副本
 * 与之配套的还有整个「本地任务副本」（tasks Map / tasksCache / artifact slice）——
 * 任务与产物一律以服务端为唯一真相（/threads、/artifacts、/run/:id）。
 */

import type { TaskInfo } from '@/types/events'
import type { TaskStore } from '../taskStore'

// ============================================================================
// State & Actions Interfaces
// ============================================================================

export type AppMode = 'simple' | 'complex' | null

export interface UISliceState {
  mode: AppMode
  runningTaskIds: Set<string>
  isInitialized: boolean
  activeRunId: string | null
  isWaitingForApproval: boolean
  /** HITL 修订中：驳回反馈已提交，规划专家修订 v(n+1)（轮询感知完成） */
  planRevising: boolean
  /** 待审批计划的行 = 协议里的 TaskInfo（审批弹窗的要求形状） */
  pendingPlan: TaskInfo[]
  pendingPlanVersion: number
  pendingRunId: string | null
  pendingExecutionPlanId: string | null
}

export interface UISliceActions {
  setMode: (mode: 'simple' | 'complex') => void
  setIsInitialized: (initialized: boolean) => void
  setActiveRunId: (runId: string | null) => void
  clearActiveRunId: () => void
  setPendingPlan: (
    plan: TaskInfo[],
    planVersion?: number,
    runId?: string | null,
    executionPlanId?: string | null,
  ) => void
  clearPendingPlan: () => void
  setIsWaitingForApproval: (waiting: boolean) => void
  setPlanRevising: (revising: boolean) => void
  addRunningTaskId: (taskId: string) => void
  removeRunningTaskId: (taskId: string) => void
  clearRunningTaskIds: () => void
  resetUI: () => void
  hasRunningTasks: () => boolean
  isTaskRunning: (taskId: string) => boolean
}

export type UISlice = UISliceState & UISliceActions

type UISliceSetter = (fn: (draft: TaskStore) => void) => void
type UISliceGetter = () => TaskStore

// ============================================================================
// Slice Factory
// ============================================================================

export const createUISlice = (set: UISliceSetter, get: UISliceGetter): UISlice => ({
  // Initial state
  mode: null,
  runningTaskIds: new Set(),
  isInitialized: false,
  activeRunId: null,
  isWaitingForApproval: false,
  planRevising: false,
  pendingPlan: [],
  pendingPlanVersion: 1,
  pendingRunId: null,
  pendingExecutionPlanId: null,

  // Actions

  setMode: (mode: 'simple' | 'complex') => {
    set((state) => {
      if (state.mode === mode) return
      state.mode = mode
    })
  },

  setIsInitialized: (initialized: boolean) => {
    set((state) => {
      state.isInitialized = initialized
    })
  },

  setActiveRunId: (runId: string | null) => {
    set((state) => {
      state.activeRunId = runId
    })
  },

  clearActiveRunId: () => {
    set((state) => {
      state.activeRunId = null
    })
  },

  setPendingPlan: (
    plan: TaskInfo[],
    planVersion: number = 1,
    runId: string | null = null,
    executionPlanId: string | null = null,
  ) => {
    set((state) => {
      state.pendingPlan = plan
      state.pendingPlanVersion = planVersion
      state.pendingRunId = runId
      state.pendingExecutionPlanId = executionPlanId
      state.isWaitingForApproval = true
    })
  },

  clearPendingPlan: () => {
    set((state) => {
      state.pendingPlan = []
      state.pendingPlanVersion = 1
      state.pendingRunId = null
      state.pendingExecutionPlanId = null
      state.isWaitingForApproval = false
    })
  },

  setPlanRevising: (revising: boolean) => {
    set((state) => {
      state.planRevising = revising
    })
  },

  setIsWaitingForApproval: (waiting: boolean) => {
    set((state) => {
      state.isWaitingForApproval = waiting
    })
  },

  addRunningTaskId: (taskId: string) => {
    set((state) => {
      state.runningTaskIds.add(taskId)
    })
  },

  removeRunningTaskId: (taskId: string) => {
    set((state) => {
      state.runningTaskIds.delete(taskId)
    })
  },

  clearRunningTaskIds: () => {
    set((state) => {
      state.runningTaskIds = new Set()
    })
  },

  resetUI: () => {
    set((state) => {
      state.mode = null
      state.runningTaskIds = new Set()
      state.isInitialized = false
      state.activeRunId = null
      state.isWaitingForApproval = false
      state.planRevising = false
      state.pendingPlan = []
      state.pendingPlanVersion = 1
      state.pendingRunId = null
      state.pendingExecutionPlanId = null
    })
  },

  hasRunningTasks: () => {
    return get().runningTaskIds.size > 0
  },

  isTaskRunning: (taskId: string) => {
    return get().runningTaskIds.has(taskId)
  },
})
