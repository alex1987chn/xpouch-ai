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
    set((state: any) => {
      state.planThinkingContent = data.content

      if (!state.session) {
        state.session = {
          sessionId: data.session_id,
          summary: data.title,
          estimatedSteps: 0,
          executionMode: 'sequential',
          status: 'running'
        }
      } else {
        state.session.status = 'running'
      }

      state.tasks = new Map()
      state.tasksCache = []
      state.tasksCacheVersion++
      state.isInitialized = false
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
