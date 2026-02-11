/**
 * UI Slice - UI state management
 * 
 * [Responsibilities]
 * - Manage UI state unrelated to application data
 * - Running task ID set
 * - Selected task ID
 * - Initialization state
 * - HITL review related UI state
 */

import type { Task } from './createTaskSlice'

// ============================================================================
// State & Actions Interfaces
// ============================================================================

export type AppMode = 'simple' | 'complex' | null

export interface UISliceState {
  mode: AppMode
  runningTaskIds: Set<string>
  selectedTaskId: string | null
  isInitialized: boolean
  isWaitingForApproval: boolean
  pendingPlan: Task[]
}

export interface UISliceActions {
  setMode: (mode: 'simple' | 'complex') => void
  selectTask: (taskId: string | null) => void
  setIsInitialized: (initialized: boolean) => void
  setPendingPlan: (plan: Task[]) => void
  clearPendingPlan: () => void
  setIsWaitingForApproval: (waiting: boolean) => void
  addRunningTaskId: (taskId: string) => void
  removeRunningTaskId: (taskId: string) => void
  clearRunningTaskIds: () => void
  resetUI: () => void
  hasRunningTasks: () => boolean
  isTaskRunning: (taskId: string) => boolean
}

export type UISlice = UISliceState & UISliceActions

// ============================================================================
// Slice Factory
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const createUISlice = (set: any, get: any): UISlice => ({
  // Initial state
  mode: null,
  runningTaskIds: new Set(),
  selectedTaskId: null,
  isInitialized: false,
  isWaitingForApproval: false,
  pendingPlan: [],

  // Actions

  setMode: (mode: 'simple' | 'complex') => {
    set((state: any) => {
      if (state.mode === mode) return
      state.mode = mode
    })
  },

  selectTask: (taskId: string | null) => {
    set((state: any) => {
      state.selectedTaskId = taskId
    })
  },

  setIsInitialized: (initialized: boolean) => {
    set((state: any) => {
      state.isInitialized = initialized
    })
  },

  setPendingPlan: (plan: Task[]) => {
    set((state: any) => {
      state.pendingPlan = plan
      state.isWaitingForApproval = true
    })
  },

  clearPendingPlan: () => {
    set((state: any) => {
      state.pendingPlan = []
      state.isWaitingForApproval = false
    })
  },

  setIsWaitingForApproval: (waiting: boolean) => {
    set((state: any) => {
      state.isWaitingForApproval = waiting
    })
  },

  addRunningTaskId: (taskId: string) => {
    set((state: any) => {
      state.runningTaskIds.add(taskId)
    })
  },

  removeRunningTaskId: (taskId: string) => {
    set((state: any) => {
      state.runningTaskIds.delete(taskId)
    })
  },

  clearRunningTaskIds: () => {
    set((state: any) => {
      state.runningTaskIds = new Set()
    })
  },

  resetUI: () => {
    set((state: any) => {
      state.mode = null
      state.runningTaskIds = new Set()
      state.selectedTaskId = null
      state.isInitialized = false
      state.isWaitingForApproval = false
      state.pendingPlan = []
    })
  },

  hasRunningTasks: () => {
    return get().runningTaskIds.size > 0
  },

  isTaskRunning: (taskId: string) => {
    return get().runningTaskIds.has(taskId)
  }
})
