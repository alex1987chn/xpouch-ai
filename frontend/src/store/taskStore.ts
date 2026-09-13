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
 * - 不将运行时临时态作为长期会话真相源
 * - 页面刷新后通过 API 恢复 thread / execution plan 状态
 */

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { persist } from 'zustand/middleware'
import { logger } from '@/utils/logger'
import { enableMapSet } from 'immer'

// 导入 Slices
import { createTaskSlice, type TaskSlice } from './slices/createTaskSlice'
import { createArtifactSlice, type ArtifactSlice } from './slices/createArtifactSlice'
import { createUISlice, type UISlice } from './slices/createUISlice'
import { createPlanningSlice, type PlanningSlice } from './slices/createPlanningSlice'

// 启用 Immer 的 Map/Set 支持（必须在 create 之前调用）
enableMapSet()

// 清理旧自研 persist 的键（键名形如 `xpouch-task-store@2`，与官方 persist 的
// `xpouch-task-store` 不同名）。不清的话 localStorage 里会长期留着一份不会再被
// 读到的运行数据。
try {
  localStorage.removeItem('xpouch-task-store@1')
  localStorage.removeItem('xpouch-task-store@2')
} catch {
  // 隐私模式等场景下 localStorage 不可用：持久化本身会静默降级，这里同样忽略
}

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
    // Persist 配置（zustand 官方 persist：与 chatStore / themeStore 同一套）
    // ============================================================================
    {
      name: 'xpouch-task-store',
      // 版本 3 = 首次改用官方 persist。旧的 `@2` 键已被上面的清理删掉，
      // 且没有需要迁移的运行数据（持久化的只有下面这几个 UI 偏好，都能重新推导），
      // 因此不写 migrate：版本不匹配时按初始状态起步即可。
      version: 3,
      // 只持久化 UI 偏好与跨刷新需要保留的标记。
      //
      // 此前还持久化了 executionPlan / tasks（含 artifacts）/ tasksCacheVersion /
      // selectedTaskId —— 那是**服务端数据的本地副本**，且没有 UI 消费者（唯一读它
      // 的是 useSessionRestore 里那段「本地产物数 vs API 产物数」对账启发式，已随
      // 副本一并移除）。留着的代价：localStorage 长期躺着一份会过期的运行数据，
      // 还要为旧结构维护 deserialize 兼容。
      // 现在产物/任务一律以服务端为唯一真相（/threads、/artifacts、/run/:id）。
      //
      // Set → 数组：JSON 表达不了 Set（官方 persist 用 JSON 存），读回时在 merge 里还原。
      partialize: (state) =>
        ({
          // UISlice：跨刷新需要保留的 UI 状态
          runningTaskIds: Array.from(state.runningTaskIds),
          isInitialized: state.isInitialized,
          mode: state.mode,
          // 不持久化临时状态：isWaitingForApproval, pendingPlan, progress
          // 这些状态应该在页面刷新后通过 API 恢复
          // PlanningSlice
          planThinkingContent: state.planThinkingContent,
        }) as unknown as Partial<TaskStore>,
      merge: (persisted, current) => {
        // 读回时把 Set 还原（store 内部契约是 Set，见 createUISlice）
        const restored = (persisted ?? {}) as { runningTaskIds?: string[] }
        return {
          ...current,
          ...(persisted as Partial<TaskStore>),
          runningTaskIds: new Set(restored.runningTaskIds ?? []),
        }
      },
      onRehydrateStorage: () => (_state, error) => {
        if (error) logger.warn('[TaskStore] 持久化状态恢复失败（按初始状态继续）:', error)
      },
    }
  )
)

// ============================================================================
// 类型导出（供组件和 Hooks 使用）
// ============================================================================

export type { ExecutionPlanState, Task, TaskStatus } from './slices/createTaskSlice'
export type { ArtifactSlice, ArtifactSliceActions } from './slices/createArtifactSlice'
export type { UISlice, UISliceState, UISliceActions, AppMode, Progress } from './slices/createUISlice'
export type { PlanningSlice, PlanningSliceState, PlanningSliceActions } from './slices/createPlanningSlice'

// 默认导出
export default useTaskStore
