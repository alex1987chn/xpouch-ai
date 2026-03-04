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
import { logger } from '@/utils/logger'
import type { TaskStore } from '../taskStore'

// ============================================================================
// State & Actions Interfaces
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ArtifactSliceState {
  // 移除 streamingArtifacts Map，不再需要流式状态
}

export interface ArtifactSliceActions {
  // Artifact CRUD
  addArtifact: (data: ArtifactGeneratedData) => void
  replaceArtifacts: (taskId: string, artifacts: Artifact[]) => void
  updateArtifactContent: (taskId: string, artifactId: string, newContent: string) => Promise<boolean>
  deleteArtifact: (taskId: string, artifactId: string) => void
  // Reset
  resetArtifacts: () => void
}

export type ArtifactSlice = ArtifactSliceState & ArtifactSliceActions

type ArtifactSliceSetter = (fn: (draft: TaskStore) => void) => void
type ArtifactSliceGetter = () => TaskStore

// ============================================================================
// Slice Factory
// ============================================================================

export const createArtifactSlice = (
  set: ArtifactSliceSetter,
  get: ArtifactSliceGetter
): ArtifactSlice => ({
  // Initial state - 不再需要 streamingArtifacts

  // Actions

  addArtifact: (data: ArtifactGeneratedData) => {
    set((state) => {
      const task = state.tasks.get(data.task_id)
      if (!task) {
        // 🔥 调试日志：task 不存在时记录信息
        if (import.meta.env.VITE_DEBUG_MODE === 'true') {
          logger.error('[ArtifactSlice] addArtifact: Task not found!', {
            taskId: data.task_id,
            availableTaskIds: Array.from(state.tasks.keys()),
            artifactId: data.artifact.id
          })
        }
        return
      }

      const existingIndex = task.artifacts.findIndex((a) => a.id === data.artifact.id)
      
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

      task.artifacts.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      // 🔥 移除：state.selectedTaskId = data.task_id（这是 UISlice 的状态）
      // 选中 Task 应由 UISlice 处理
      
      // 🔥 调试日志：记录添加成功
      if (import.meta.env.VITE_DEBUG_MODE === 'true') {
        logger.debug('[ArtifactSlice] addArtifact: 成功添加', {
          taskId: data.task_id,
          artifactId: data.artifact.id,
          totalArtifacts: task.artifacts.length
        })
      }
    })
    // Call Action outside of set() to avoid nested update anti-pattern
    get().syncTasksCache()
  },

  replaceArtifacts: (taskId: string, artifacts: Artifact[]) => {
    set((state) => {
      const task = state.tasks.get(taskId)
      if (!task) return
      task.artifacts = artifacts
    })
    // Call Action outside of set()
    get().syncTasksCache()
  },

  deleteArtifact: (taskId: string, artifactId: string) => {
    let shouldSync = false
    set((state) => {
      const task = state.tasks.get(taskId)
      if (!task) return

      const index = task.artifacts.findIndex((a) => a.id === artifactId)
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
      logger.error('[ArtifactSlice] Task not found:', taskId)
      return false
    }

    const artifact = task.artifacts.find((a) => a.id === artifactId)
    if (!artifact) {
      logger.error('[ArtifactSlice] Artifact not found:', artifactId)
      return false
    }

    const oldContent = artifact.content

    set((state) => {
      const taskToUpdate = state.tasks.get(taskId)
      if (!taskToUpdate) return

      const artifactToUpdate = taskToUpdate.artifacts.find((a) => a.id === artifactId)
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
      logger.info('[ArtifactSlice] Artifact updated successfully:', artifactId)
      return true
    } catch (error) {
      logger.error('[ArtifactSlice] Failed to update artifact, rolling back:', error)

      set((state) => {
        const taskToRollback = state.tasks.get(taskId)
        if (!taskToRollback) return

        const artifactToRollback = taskToRollback.artifacts.find((a) => a.id === artifactId)
        if (!artifactToRollback) return

        artifactToRollback.content = oldContent
      })
      // Call Action outside of set()
      get().syncTasksCache()

      throw error
    }
  },

  /**
   * 🔥 新增：清空所有 Task 的 Artifacts
   * 用于 resetAll 时清理 Artifact 状态
   */
  resetArtifacts: () => {
    set((state) => {
      // 清空每个 task 的 artifacts 数组
      state.tasks.forEach((task) => {
        task.artifacts = []
      })
    })
    // Call Action outside of set()
    get().syncTasksCache()
  }
})
