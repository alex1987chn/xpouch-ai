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
 */

import type { Task } from './createTaskSlice'
import type { TaskStore } from '../taskStore'

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
  setProgress: (progress: Progress | null) => void  // 新增
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
  selectedTaskId: null,
  isInitialized: false,
  activeRunId: null,
  isWaitingForApproval: false,
  pendingPlan: [],
  pendingPlanVersion: 1,
  pendingRunId: null,
  pendingExecutionPlanId: null,
  progress: null,  // 新增

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
      state.progress = null  // 重置进度
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
  }
})
