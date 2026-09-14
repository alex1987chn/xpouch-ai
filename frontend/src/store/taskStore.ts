/**
 * 任务状态管理 Store (Zustand + Immer + Slice Pattern)
 *
 * [职责] 只保存**工作台的 UI 状态**：
 * - `createUISlice`:       模式、运行中任务集合、当前运行实例、HITL 审批相关
 *
 * [2026-09-13 清理：删掉「本地任务副本」]
 * 此前这里还有 `createTaskSlice`（tasks Map + tasksCache + 任务 CRUD）与
 * `createArtifactSlice`（产物挂在 task.artifacts 上）。逐个核对消费者后确认整条链
 * **只写不读**：没有任何组件订阅 `tasks` / `tasksCache` / `task.artifacts`，
 * 唯一的本地读取方（useSessionRestore 里的「本地 vs 服务端产物数」对账启发式）早已移除。
 * [2026-09-14 清理：删掉 createPlanningSlice]
 * 同一套只写不读（评审 M5）：planThinkingContent 没有任何 UI 消费者（思考面板读的是
 * message.metadata.thinking，由 taskEvents 另写一份），却挂在 persist 的 partialize
 * 里——plan.thinking 的每个 delta 都触发一次 localStorage 全量序列化。
 *
 * 留着的代价不是「多占一点内存」，而是**双真相源**：任务与产物的真相在服务端
 * （/threads、/artifacts、/run/:id），本地再存一份就要维护它的同步时机，而任何一次
 * 漏同步都表现为「界面状态和执行状态对不上」——最难查的那类问题。
 *
 * [持久化] 只持久化跨刷新要保留的 UI 偏好（见下方 partialize）；运行数据不在其中，
 * 它们由 useSessionRestore 从服务端恢复。
 */

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { persist } from 'zustand/middleware'
import { logger } from '@/utils/logger'
import { enableMapSet } from 'immer'

// 导入 Slices
import { createUISlice, type UISlice } from './slices/createUISlice'

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

export type TaskStore = UISlice & {
  resetAll: (force?: boolean) => void
}

// ============================================================================
// Store 实现
// ============================================================================

export const useTaskStore = create<TaskStore>()(
  persist(
    immer((set, get, _api) => ({
      // 组合所有 Slices
      ...createUISlice(set, get),

      // 全局重置方法 - 组合各 Slice 的重置逻辑
      resetAll: (_force: boolean = false) => {
        // 🔥 按依赖顺序重置各 Slice 状态
        get().resetUI() // 1. 重置 UI 状态
      },
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
          // 不持久化临时状态：isWaitingForApproval, pendingPlan
          // 这些状态应该在页面刷新后通过 API 恢复
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

export type { UISlice, UISliceState, UISliceActions, AppMode } from './slices/createUISlice'

// 默认导出
export default useTaskStore
