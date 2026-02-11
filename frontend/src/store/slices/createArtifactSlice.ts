/**
 * Artifact Slice - Artifact management
 * 
 * [Responsibilities]
 * - Manage Artifacts within Tasks (CRUD)
 * - Handle Artifact streaming generation state
 * - Provide async update and persistence to backend
 * 
 * [Architecture Note]
 * Cross-slice cache sync: All actions call `get().syncTasksCache()` 
 * OUTSIDE of `set()` closure to avoid nested Action anti-pattern.
 * React 18 Automatic Batching ensures single re-render.
 */

import type {
  ArtifactGeneratedData,
  ArtifactStartData,
  ArtifactChunkData,
  ArtifactCompletedData
} from '@/types/events'
import type { Artifact } from '@/types'

// ============================================================================
// State & Actions Interfaces
// ============================================================================

export interface ArtifactSliceState {
  streamingArtifacts: Map<string, string>
}

export interface ArtifactSliceActions {
  // Artifact CRUD
  addArtifact: (data: ArtifactGeneratedData) => void
  replaceArtifacts: (taskId: string, artifacts: Artifact[]) => void
  updateArtifactContent: (taskId: string, artifactId: string, newContent: string) => Promise<boolean>
  deleteArtifact: (taskId: string, artifactId: string) => void
  
  // Streaming control
  startArtifact: (data: ArtifactStartData) => void
  streamArtifactChunk: (data: ArtifactChunkData) => void
  completeArtifact: (data: ArtifactCompletedData) => void
  
  // Get streaming content
  getStreamingContent: (artifactId: string) => string | undefined
}

export type ArtifactSlice = ArtifactSliceState & ArtifactSliceActions

// ============================================================================
// Slice Factory
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const createArtifactSlice = (set: any, get: any): ArtifactSlice => ({
  // Initial state
  streamingArtifacts: new Map(),

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
  },

  startArtifact: (data: ArtifactStartData) => {
    set((state: any) => {
      state.streamingArtifacts.set(data.artifact_id, '')

      const task = state.tasks.get(data.task_id)
      if (task) {
        const existingIndex = task.artifacts.findIndex((a: any) => a.id === data.artifact_id)
        
        if (existingIndex < 0) {
          task.artifacts.push({
            id: data.artifact_id,
            type: data.type as any,
            title: data.title,
            content: '',
            sortOrder: 0,
            createdAt: new Date().toISOString(),
            isStreaming: true
          })
          task.artifacts.sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        }
      }

      state.selectedTaskId = data.task_id
    })
    // Call Action outside of set()
    get().syncTasksCache()
  },

  streamArtifactChunk: (data: ArtifactChunkData) => {
    let shouldUpdateCache = false
    let targetTaskId: string | null = null

    set((state: any) => {
      const currentContent = state.streamingArtifacts.get(data.artifact_id) || ''
      const newContent = currentContent + data.delta
      state.streamingArtifacts.set(data.artifact_id, newContent)

      for (const [taskId, task] of state.tasks.entries()) {
        const artifact = task.artifacts.find((a: any) => a.id === data.artifact_id)
        if (artifact) {
          artifact.content = newContent
          shouldUpdateCache = true
          targetTaskId = taskId
          break
        }
      }
    })

    // 🔥 关键修复：必须触发 cache 同步以更新 UI
    // streamArtifactChunk 是高频调用，但我们仍需要定期刷新 UI
    // 通过 syncTasksCache 重建 tasksCache 数组，触发 useShallow 比较
    if (shouldUpdateCache && targetTaskId) {
      // 使用微任务批量处理，避免每帧都重建 cache
      queueMicrotask(() => {
        get().syncTasksCache()
      })
    }
  },

  completeArtifact: (data: ArtifactCompletedData) => {
    set((state: any) => {
      state.streamingArtifacts.delete(data.artifact_id)

      for (const task of state.tasks.values()) {
        const artifact = task.artifacts.find((a: any) => a.id === data.artifact_id)
        if (artifact) {
          artifact.content = data.full_content
          artifact.isStreaming = false
          break
        }
      }
    })
    // Call Action outside of set()
    get().syncTasksCache()
  },

  getStreamingContent: (artifactId: string): string | undefined => {
    return get().streamingArtifacts.get(artifactId)
  }
})
