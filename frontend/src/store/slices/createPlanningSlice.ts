/**
 * Planning Slice - Planning phase state management
 * 
 * [Responsibilities]
 * - Manage Commander planning thinking content
 * - Handle planning phase event responses (plan.started, plan.thinking)
 */

import type { PlanStartedData, PlanThinkingData } from '@/types/events'

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

// ============================================================================
// Slice Factory
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const createPlanningSlice = (set: any, _get: any): PlanningSlice => ({
  // Initial state
  planThinkingContent: '',

  // Actions

  startPlan: (data: PlanStartedData) => {
    // v3.2.0: 仅更新本 Slice 的状态，不涉及其他 Slice
    // session/tasks/isInitialized 等状态由组件层调用 resetAll() 统一重置
    set((state: any) => {
      state.planThinkingContent = data.content
    })
  },

  appendPlanThinking: (data: PlanThinkingData) => {
    set((state: any) => {
      state.planThinkingContent += data.delta
    })
  },

  setPlanThinkingContent: (content: string) => {
    set((state: any) => {
      state.planThinkingContent = content
    })
  },

  clearPlanThinking: () => {
    set((state: any) => {
      state.planThinkingContent = ''
    })
  },

  resetPlanning: () => {
    set((state: any) => {
      state.planThinkingContent = ''
    })
  }
})
