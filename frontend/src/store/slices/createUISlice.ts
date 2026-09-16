/**
 * UI Slice - 工作台 UI 状态
 *
 * [职责边界] 只放**有真实消费者**的 UI 状态：
 * - `mode`：simple / complex 判定
 * - `runningTaskIds`：正在执行的任务集合（ChatStreamPanel 的「执行中」态）
 * - `activeRunId`：当前接管运行实例（轮询、审批、恢复三处都用它）
 * - HITL 相关：`pendingPlan` / `pendingPlanVersion` / `pendingRunId` /
 *   `isWaitingForApproval` / `planRevising`（审批卡与恢复）
 *
 * [2026-09-13 清理] 删掉了三组**只写不读**的状态（连同它们的 action 与 selector）：
 * - `selectedTaskId` / `selectTask`：无任何消费者（资源画布走服务端查询与 threadId）
 * - `progress` / `setProgress`：写点在 task 事件处理器里，无读取方
 * - `isPolling` / `pollingStatus` / `isHITLPaused` 及其 setter：轮询状态的真身在
 *   `useRunPolling` 的状态机里，这几个字段是从未被写入过的影子副本
 * 与之配套的还有整个「本地任务副本」（tasks Map / tasksCache / artifact slice）——
 * 任务与产物一律以服务端为唯一真相（/threads、/artifacts、/run/:id）。
 *
 * [2026-09-16 清理] 再删两组只写不读：
 * - `isInitialized` / `setIsInitialized`：除 localStorage partialize 外零消费者
 * - `pendingExecutionPlanId`（setPendingPlan 第 4 参）：从未被读取
 * - `clearRunningTaskIds` / `hasRunningTasks` / `isTaskRunning`：零调用 action
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
  activeRunId: string | null
  isWaitingForApproval: boolean
  /** HITL 修订中：驳回反馈已提交，规划专家修订 v(n+1)（轮询感知完成） */
  planRevising: boolean
  /** 待审批计划的行 = 协议里的 TaskInfo（审批弹窗的要求形状） */
  pendingPlan: TaskInfo[]
  /**
   * 上一版计划（仅当本次是**修订**结果时非空）。
   *
   * 用途：审批弹窗里的「本次修订改动」对照。修订是删旧行建新行，跨版本只有位置
   * 可比（见 lib/planDiff 的说明），所以对照必须在**内存**里留住上一版——
   * 服务端不再保留 v(n) 的任务行。刷新页面后这份对照会丢，属可接受降级
   * （此时界面上仍会显示完整的新计划）。
   */
  previousPendingPlan: TaskInfo[]
  pendingPlanVersion: number
  pendingRunId: string | null
}

export interface UISliceActions {
  setMode: (mode: 'simple' | 'complex') => void
  setActiveRunId: (runId: string | null) => void
  clearActiveRunId: () => void
  setPendingPlan: (plan: TaskInfo[], planVersion?: number, runId?: string | null) => void
  clearPendingPlan: () => void
  setIsWaitingForApproval: (waiting: boolean) => void
  setPlanRevising: (revising: boolean) => void
  addRunningTaskId: (taskId: string) => void
  removeRunningTaskId: (taskId: string) => void
  resetUI: () => void
}

export type UISlice = UISliceState & UISliceActions

type UISliceSetter = (fn: (draft: TaskStore) => void) => void
// ============================================================================
// Slice Factory
// ============================================================================

export const createUISlice = (set: UISliceSetter): UISlice => ({
  // Initial state
  mode: null,
  runningTaskIds: new Set(),
  activeRunId: null,
  isWaitingForApproval: false,
  planRevising: false,
  pendingPlan: [],
  previousPendingPlan: [],
  pendingPlanVersion: 1,
  pendingRunId: null,

  // Actions

  setMode: (mode: 'simple' | 'complex') => {
    set((state) => {
      if (state.mode === mode) return
      state.mode = mode
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

  setPendingPlan: (plan: TaskInfo[], planVersion: number = 1, runId: string | null = null) => {
    set((state) => {
      // 版本号变大 = 这一份是修订结果 → 把上一版留作对照（同版本重复下发不算修订）
      if (planVersion > state.pendingPlanVersion && state.pendingPlan.length > 0) {
        state.previousPendingPlan = state.pendingPlan
      }
      state.pendingPlan = plan
      state.pendingPlanVersion = planVersion
      state.pendingRunId = runId
      state.isWaitingForApproval = true
    })
  },

  clearPendingPlan: () => {
    set((state) => {
      state.pendingPlan = []
      state.previousPendingPlan = []
      state.pendingPlanVersion = 1
      state.pendingRunId = null
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

  resetUI: () => {
    set((state) => {
      state.mode = null
      state.runningTaskIds = new Set()
      state.activeRunId = null
      state.isWaitingForApproval = false
      state.planRevising = false
      state.pendingPlan = []
      state.previousPendingPlan = []
      state.pendingPlanVersion = 1
      state.pendingRunId = null
    })
  },
})
