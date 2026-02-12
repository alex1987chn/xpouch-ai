/**
 * Artifact Slice - Artifact management
 *
 * [Responsibilities]
 * - Manage Artifacts within Tasks (CRUD)
 * - Provide async update and persistence to backend
 *
 * [重构：移除流式逻辑]
 * - 删除 streamingArtifacts Map
 * - 删除 startArtifact / streamArtifactChunk 方法
 * - 只保留批处理模式的 addArtifact 方法
 * - 符合 SDUI 原则：后端推送完整 Artifact，前端直接存储
 * 
 * [Architecture Note]
 * Cross-slice cache sync: All actions call `get().syncTasksCache()` 
 * OUTSIDE of `set()` closure to avoid nested Action anti-pattern.
 * React 19 Automatic Batching ensures single re-render.
 */

import type {
  ArtifactGeneratedData
} from '@/types/events'
import type { Artifact } from '@/types'

// ============================================================================
// State & Actions Interfaces
// ============================================================================

export interface ArtifactSliceState {
  // 移除 streamingArtifacts Map，不再需要流式状态
}

export interface ArtifactSliceActions {
  // Artifact CRUD
  addArtifact: (data: ArtifactGeneratedData) => void
  replaceArtifacts: (taskId: string, artifacts: Artifact[]) => void
  updateArtifactContent: (taskId: string, artifactId: string, newContent: string) => Promise<boolean>
  deleteArtifact: (taskId: string, artifactId: string) => void
}

export type ArtifactSlice = ArtifactSliceState & ArtifactSliceActions

// ============================================================================
// Slice Factory
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const createArtifactSlice = (set: any, get: any): ArtifactSlice => ({
  // Initial state - 不再需要 streamingArtifacts

  // Actions

  addArtifact: (data: ArtifactGeneratedData) => {
    set((state: any) => {
      const task = state.tasks.get(data.task_id)
      if (!task) return

      const existingIndex = task.artifacts.findIndex((a: any) => a.id === data.artifact.id)
      
      if (existingIndex >= 0) {
        task.artifacts[existingIndex] = {
          id: data.artifact.id,
          type: data.artifact.type as Artifact['type'],
          title: data.artifact.title,
          content: data.artifact.content,
          language: data.artifact.language,
          sortOrder: data.artifact.sort_order,
          createdAt: task.artifacts[existingIndex].createdAt || new Date().toISOString()
        }
      } else {
        task.artifacts.push({
          id: data.artifact.id,
          type: data.artifact.type as Artifact['type'],
          title: data.artifact.title,
          content: data.artifact.content,
          language: data.artifact.language,
          sortOrder: data.artifact.sort_order,
          createdAt: new Date().toISOString()
        })
      }

      task.artifacts.sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      state.selectedTaskId = data.task_id
    })
    // Call Action outside of set() to avoid nested update anti-pattern
    get().syncTasksCache()
  },

  replaceArtifacts: (taskId: string, artifacts: Artifact[]) => {
    set((state: any) => {
      const task = state.tasks.get(taskId)
      if (!task) return
      task.artifacts = artifacts
    })
    // Call Action outside of set()
    get().syncTasksCache()
  },

  deleteArtifact: (taskId: string, artifactId: string) => {
    let shouldSync = false
    set((state: any) => {
      const task = state.tasks.get(taskId)
      if (!task) return

      const index = task.artifacts.findIndex((a: any) => a.id === artifactId)
      if (index >= 0) {
        task.artifacts.splice(index, 1)
        shouldSync = true
      }
    })
    // Call Action outside of set()
    if (shouldSync) get().syncTasksCache()
  },

  updateArtifactContent: async (taskId: string, artifactId: string, newContent: string): Promise<boolean> => {
    const state = get()
    const task = state.tasks.get(taskId)
    
    if (!task) {
      console.error('[ArtifactSlice] Task not found:', taskId)
      return false
    }

    const artifact = task.artifacts.find((a: any) => a.id === artifactId)
    if (!artifact) {
      console.error('[ArtifactSlice] Artifact not found:', artifactId)
      return false
    }

    const oldContent = artifact.content

    set((state: any) => {
      const taskToUpdate = state.tasks.get(taskId)
      if (!taskToUpdate) return

      const artifactToUpdate = taskToUpdate.artifacts.find((a: any) => a.id === artifactId)
      if (!artifactToUpdate) return

      artifactToUpdate.content = newContent
    })
    // Call Action outside of set()
    get().syncTasksCache()

    try {
      const { updateArtifact } = await import('@/services/chat')
      await updateArtifact({
        artifactId,
        content: newContent
      })
      console.log('[ArtifactSlice] Artifact updated successfully:', artifactId)
      return true
    } catch (error) {
      console.error('[ArtifactSlice] Failed to update artifact, rolling back:', error)

      set((state: any) => {
        const taskToRollback = state.tasks.get(taskId)
        if (!taskToRollback) return

        const artifactToRollback = taskToRollback.artifacts.find((a: any) => a.id === artifactId)
        if (!artifactToRollback) return

        artifactToRollback.content = oldContent
      })
      // Call Action outside of set()
      get().syncTasksCache()

      throw error
    }
  }
})
