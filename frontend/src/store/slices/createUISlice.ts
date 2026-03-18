/**
 * UI Slice - UI state management
 *
 * [Responsibilities]
 * - Manage UI state unrelated to application data
 * - Running task ID set
 * - Selected task ID
 * - Initialization state
 * - HITL review related UI state
 * - Progress tracking (从 ExecutionStore 迁移)
 * - Polling state (轮询状态)
 */

import type { Task } from './createTaskSlice'
import type { TaskStore } from '../taskStore'
import { useTaskStore } from '../taskStore'
import type { RunStatus } from '@/types/run'

// ============================================================================
// State & Actions Interfaces
// ============================================================================

export type AppMode = 'simple' | 'complex' | null

export interface Progress {
  current: number
  total: number
}

export interface UISliceState {
  mode: AppMode
  runningTaskIds: Set<string>
  selectedTaskId: string | null
  isInitialized: boolean
  activeRunId: string | null
  isWaitingForApproval: boolean
  pendingPlan: Task[]
  pendingPlanVersion: number
  pendingRunId: string | null
  pendingExecutionPlanId: string | null
  progress: Progress | null  // 从 ExecutionStore 迁移
  // 轮询状态
  isPolling: boolean
  pollingStatus: RunStatus | null
  isHITLPaused: boolean
}

export interface UISliceActions {
  setMode: (mode: 'simple' | 'complex') => void
  selectTask: (taskId: string | null) => void
  setIsInitialized: (initialized: boolean) => void
  setActiveRunId: (runId: string | null) => void
  clearActiveRunId: () => void
  setPendingPlan: (
    plan: Task[],
    planVersion?: number,
    runId?: string | null,
    executionPlanId?: string | null,
  ) => void
  clearPendingPlan: () => void
  setIsWaitingForApproval: (waiting: boolean) => void
  addRunningTaskId: (taskId: string) => void
  removeRunningTaskId: (taskId: string) => void
  clearRunningTaskIds: () => void
  resetUI: () => void
  hasRunningTasks: () => boolean
  isTaskRunning: (taskId: string) => boolean
  setProgress: (progress: Progress | null) => void
  // 轮询 Actions
  setPolling: (polling: boolean) => void
  setPollingStatus: (status: RunStatus | null) => void
  setHITLPaused: (paused: boolean) => void
}

export type UISlice = UISliceState & UISliceActions

// ============================================================================
// 轮询状态 Selectors
// ============================================================================

/** 获取轮询状态 */
export const useIsPolling = () => useTaskStore(state => state.isPolling)

/** 获取轮询状态 */
export const usePollingStatus = () => useTaskStore(state => state.pollingStatus)

/** 获取 HITL 暂停状态 */
export const useIsHITLPaused = () => useTaskStore(state => state.isHITLPaused)

type UISliceSetter = (fn: (draft: TaskStore) => void) => void
type UISliceGetter = () => TaskStore

// ============================================================================
// Slice Factory
// ============================================================================

export const createUISlice = (set: UISliceSetter, get: UISliceGetter): UISlice => ({
  // Initial state
  mode: null,
  runningTaskIds: new Set(),
  selectedTaskId: null,
  isInitialized: false,
  activeRunId: null,
  isWaitingForApproval: false,
  pendingPlan: [],
  pendingPlanVersion: 1,
  pendingRunId: null,
  pendingExecutionPlanId: null,
  progress: null,
  // 轮询状态初始值
  isPolling: false,
  pollingStatus: null,
  isHITLPaused: false,

  // Actions

  setMode: (mode: 'simple' | 'complex') => {
    set((state) => {
      if (state.mode === mode) return
      state.mode = mode
    })
  },

  selectTask: (taskId: string | null) => {
    set((state) => {
      state.selectedTaskId = taskId
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
    plan: Task[],
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
      state.selectedTaskId = null
      state.isInitialized = false
      state.activeRunId = null
      state.isWaitingForApproval = false
      state.pendingPlan = []
      state.pendingPlanVersion = 1
      state.pendingRunId = null
      state.pendingExecutionPlanId = null
      state.progress = null
      // 重置轮询状态
      state.isPolling = false
      state.pollingStatus = null
      state.isHITLPaused = false
    })
  },

  hasRunningTasks: () => {
    return get().runningTaskIds.size > 0
  },

  isTaskRunning: (taskId: string) => {
    return get().runningTaskIds.has(taskId)
  },

  // 新增进度设置方法
  setProgress: (progress: Progress | null) => {
    set((state) => {
      state.progress = progress
    })
  },

  // 轮询状态 Actions
  setPolling: (polling: boolean) => {
    set((state) => {
      state.isPolling = polling
    })
  },

  setPollingStatus: (status: RunStatus | null) => {
    set((state) => {
      state.pollingStatus = status
    })
  },

  setHITLPaused: (paused: boolean) => {
    set((state) => {
      state.isHITLPaused = paused
    })
  }
})
