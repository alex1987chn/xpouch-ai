/**
 * Planning Slice - Planning phase state management
 * 
 * [Responsibilities]
 * - Manage Commander planning thinking content
 * - Handle planning phase event responses (plan.started, plan.thinking)
 */

import type { PlanStartedData, PlanThinkingData } from '@/types/events'
import type { TaskStore } from '../taskStore'

// ============================================================================
// State & Actions Interfaces
// ============================================================================

export interface PlanningSliceState {
  planThinkingContent: string
}

export interface PlanningSliceActions {
  startPlan: (data: PlanStartedData) => void
  appendPlanThinking: (data: PlanThinkingData) => void
  setPlanThinkingContent: (content: string) => void
  clearPlanThinking: () => void
  resetPlanning: () => void
}

export type PlanningSlice = PlanningSliceState & PlanningSliceActions

type PlanningSliceSetter = (fn: (draft: TaskStore) => void) => void
type PlanningSliceGetter = () => TaskStore

// ============================================================================
// Slice Factory
// ============================================================================

export const createPlanningSlice = (
  set: PlanningSliceSetter,
  _get: PlanningSliceGetter
): PlanningSlice => ({
  // Initial state
  planThinkingContent: '',

  // Actions

  startPlan: (data: PlanStartedData) => {
    // v3.2.0: 仅更新本 Slice 的状态，不涉及其他 Slice
    // session/tasks/isInitialized 等状态由组件层调用 resetAll() 统一重置
    set((state) => {
      state.planThinkingContent = data.content
    })
  },

  appendPlanThinking: (data: PlanThinkingData) => {
    set((state) => {
      state.planThinkingContent += data.delta
    })
  },

  setPlanThinkingContent: (content: string) => {
    set((state) => {
      state.planThinkingContent = content
    })
  },

  clearPlanThinking: () => {
    set((state) => {
      state.planThinkingContent = ''
    })
  },

  resetPlanning: () => {
    set((state) => {
      state.planThinkingContent = ''
    })
  }
})
