/**
 * 任务状态管理 Store (Zustand + Immer + Slice Pattern)
 * 
 * [架构升级 - 批处理模式重构]
 * - 移除 Artifact 流式逻辑（streamingArtifacts 已删除）
 * - 所有 Artifact 通过 artifact.generated 事件全量推送
 * - 新增 progress 状态（从 ExecutionStore 迁移）
 * - 符合 SDUI 原则：后端推送什么，前端就存什么
 * 
 * [新架构]
 * - createTaskSlice:      核心任务数据 + syncTasksCache
 * - createArtifactSlice:  产物管理（批处理模式）
 * - createUISlice:        纯 UI 状态（模式、选中、运行中任务、进度）
 * - createPlanningSlice:  规划阶段状态（思考内容）
 * 
 * [职责]
 * 管理复杂模式下的多专家协作状态：
 * - 任务计划（Plan）初始化与更新
 * - 专家任务状态跟踪（pending/running/completed/failed）
 * - Artifact 产物管理（增删改查）
 * - HITL 状态管理（等待用户确认）
 * 
 * [性能优化]
 * - Map 结构避免大数组遍历更新
 * - tasksCache 通过 syncTasksCache 统一重建
 * - Selectors 模式避免不必要重渲染
 * 
 * [持久化]
 * - 不持久化到 localStorage（会话级状态）
 * - 页面刷新后通过 API 恢复会话状态
 */

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { logger } from '@/utils/logger'
import { enableMapSet } from 'immer'
import { persist } from './middleware/persist'

// 导入 Slices
import { createTaskSlice, type TaskSlice } from './slices/createTaskSlice'
import { createArtifactSlice, type ArtifactSlice } from './slices/createArtifactSlice'
import { createUISlice, type UISlice } from './slices/createUISlice'
import { createPlanningSlice, type PlanningSlice } from './slices/createPlanningSlice'

// 启用 Immer 的 Map/Set 支持（必须在 create 之前调用）
enableMapSet()

// ============================================================================
// 合并 Store 类型
// ============================================================================

export type TaskStore = TaskSlice & ArtifactSlice & UISlice & PlanningSlice & {
  resetAll: (force?: boolean) => void
}

// ============================================================================
// Store 实现
// ============================================================================

export const useTaskStore = create<TaskStore>()(
  persist(
    immer((set, get, _api) => ({
      // 组合所有 Slices
      ...createTaskSlice(set, get),
      ...createArtifactSlice(set, get),
      ...createUISlice(set, get),
      ...createPlanningSlice(set, get),
      
      // 全局重置方法 - 组合各 Slice 的重置逻辑
      resetAll: (force: boolean = false) => {
        // 🔥 按依赖顺序重置各 Slice 状态
        get().resetArtifacts()   // 1. 重置 Artifacts（在 Task 之前）
        // P0 修复：传入 hasRunningTasks 检查函数，避免 TaskSlice 直接访问 UISlice 状态
        get().resetTasks(force, () => get().hasRunningTasks())  // 2. 重置 Task 数据
        get().resetUI()          // 3. 重置 UI 状态（依赖 Task 数据）
        get().resetPlanning()    // 4. 重置 Planning 状态
      }
    })),
    // ============================================================================
    // Persist 配置
    // ============================================================================
    {
      name: 'xpouch-task-store',
      version: 2,  // 版本升级
      // 只持久化关键字段
      partialize: (state: TaskStore) => ({
        // TaskSlice
        session: state.session,
        tasks: Array.from(state.tasks.entries()),
        tasksCacheVersion: state.tasksCacheVersion,
        // UISlice
        runningTaskIds: Array.from(state.runningTaskIds),
        selectedTaskId: state.selectedTaskId,
        isInitialized: state.isInitialized,
        mode: state.mode,
        // 不持久化临时状态：isWaitingForApproval, pendingPlan, progress
        // 这些状态应该在页面刷新后通过 API 恢复
        // PlanningSlice
        planThinkingContent: state.planThinkingContent,
      }),
      // 自定义序列化：处理 Map/Set
      serialize: (state: unknown) => {
        try {
          return JSON.stringify(state)
        } catch (error) {
          logger.error('[TaskStore] serialize 失败:', error)
          throw error
        }
      },
      deserialize: (str: string) => {
        try {
          if (!str) {
            logger.warn('[TaskStore] deserialize: 空字符串')
            return {}
          }

          const parsed = JSON.parse(str)

          // 恢复 Map
          if (parsed.tasks && Array.isArray(parsed.tasks)) {
            parsed.tasks = new Map(parsed.tasks)
            
            // 重建 tasksCache
            parsed.tasksCache = Array.from(parsed.tasks.values())
              .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          } else {
            parsed.tasks = new Map()
            parsed.tasksCache = []
          }

          // 恢复 Set: ['id1', 'id2', ...] => Set
          if (parsed.runningTaskIds && Array.isArray(parsed.runningTaskIds)) {
            parsed.runningTaskIds = new Set(parsed.runningTaskIds)
          } else {
            parsed.runningTaskIds = new Set()
          }

          return parsed
        } catch (error) {
          logger.error('[TaskStore] deserialize 失败:', error)
          // 返回一个安全的默认状态
          return {
            session: null,
            tasks: new Map(),
            tasksCache: [],
            runningTaskIds: new Set(),
            selectedTaskId: null,
            isInitialized: false,
            mode: null,
            isWaitingForApproval: false,
            pendingPlan: [],
            pendingPlanVersion: 1,
            planThinkingContent: '',
            progress: null
          }
        }
      }
    }
  )
)

// ============================================================================
// 类型导出（供组件和 Hooks 使用）
// ============================================================================

export type { Task, TaskStatus, TaskSession } from './slices/createTaskSlice'
export type { ArtifactSlice, ArtifactSliceActions } from './slices/createArtifactSlice'
export type { UISlice, UISliceState, UISliceActions, AppMode, Progress } from './slices/createUISlice'
export type { PlanningSlice, PlanningSliceState, PlanningSliceActions } from './slices/createPlanningSlice'

// 默认导出
export default useTaskStore
