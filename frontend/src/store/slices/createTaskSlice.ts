/**
 * Task Slice - Core task data management
 * 
 * [Responsibilities]
 * - Manage Task CRUD operations
 * - Maintain tasksCache (derived array for React component iteration)
 * - Provide syncTasksCache for other slices to ensure cache consistency
 */

import type {
  PlanCreatedData,
  TaskStartedData,
  TaskCompletedData,
  TaskFailedData,
  TaskInfo
} from '@/types/events'
import type { ExecutionPlan as ApiExecutionPlan, SubTask, Artifact } from '@/types'
import { formatTaskOutput } from '@/utils/formatters'
import { logger } from '@/utils/logger'
import type { TaskStore } from '../taskStore'

// ============================================================================
// Types
// ============================================================================

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed'

export interface Task extends TaskInfo {
  startedAt?: string
  completedAt?: string
  durationMs?: number
  output?: string
  error?: string
  artifacts: Artifact[]
}

export interface ExecutionPlanState {
  executionPlanId: string
  summary: string
  estimatedSteps: number
  executionMode: 'sequential' | 'parallel'
  status: 'pending' | 'running' | 'completed' | 'failed'
  /** 关联的运行实例 ID（用于跳转到时间线页面） */
  runId?: string
  /** 关联的线程 ID */
  threadId?: string
}

// ============================================================================
// State & Actions Interfaces
// ============================================================================

export interface TaskSliceState {
  executionPlan: ExecutionPlanState | null
  tasks: Map<string, Task>
  tasksCache: Task[]
  tasksCacheVersion: number
}

export interface TaskSliceActions {
  // Mode & ExecutionPlan
  setMode: (mode: 'simple' | 'complex') => void
  
  // Plan initialization
  initializePlan: (data: PlanCreatedData) => void
  updateTasksFromPlan: (newPlan: Array<{
    id: string
    expert_type: string
    description: string
    sort_order?: number
    status?: string
  }>) => void
  
  // Task status flow
  startTask: (data: TaskStartedData) => void
  completeTask: (data: TaskCompletedData) => void
  failTask: (data: TaskFailedData) => void
  
  // Task CRUD
  addTask: (task: Task) => void
  updateTask: (taskId: string, updates: Partial<Task>) => void
  deleteTask: (taskId: string) => void
  setTasks: (tasks: Map<string, Task>) => void
  
  // ExecutionPlan restore
  restoreFromExecutionPlan: (executionPlan: ApiExecutionPlan, subTasks: SubTask[]) => void
  
  // Reset all tasks
  resetTasks: (force?: boolean, hasRunningTasks?: () => boolean) => void
  
  // Cache sync (for other slices to call)
  syncTasksCache: () => void
}

export type TaskSlice = TaskSliceState & TaskSliceActions

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * 重建任务缓存 - DRY 原则，所有修改 tasks 的地方复用此函数
 * 直接在 Draft State 上修改，Immer 会自动处理不可变性
 * 注意：无需手动深拷贝，Immer 的 finish 阶段会自动冻结并更新引用
 */
export const rebuildTasksCache = (state: TaskSliceState) => {
  state.tasksCache = Array.from(state.tasks.values())
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  state.tasksCacheVersion++
}


// ============================================================================
// Slice Factory
// ============================================================================

// Immer-enabled set type - allows direct mutation of draft state
// Using TaskStore to allow cross-slice state access (e.g., runningTaskIds in resetTasks)
type TaskSliceSetter = (fn: (draft: TaskStore) => void) => void
type TaskSliceGetter = () => TaskStore

export const createTaskSlice = (
  set: TaskSliceSetter,
  _get: TaskSliceGetter
): TaskSlice => ({
  // Initial state
  executionPlan: null,
  tasks: new Map(),
  tasksCache: [],
  tasksCacheVersion: 0,

  // Actions

  /**
   * 🔥 已弃用：请使用 UISlice 的 setMode
   * 保留此方法仅用于兼容性，实际逻辑移交给 UISlice
   */
  setMode: (mode: 'simple' | 'complex') => {
    // ⚠️ 跨 Slice 修改已移除
    // UI 状态切换应通过 UISlice.setMode 处理
    // TaskSlice 只关注 Task 数据本身的清理
    set((state) => {
      if (mode === 'simple') {
        // 只清理 TaskSlice 自己的状态
        state.executionPlan = null
        state.tasks = new Map()
        rebuildTasksCache(state)
      }
    })
  },

  initializePlan: (data: PlanCreatedData) => {
    set((state) => {
      if (state.executionPlan?.executionPlanId === data.execution_plan_id) {
        const newTaskIds = new Set(data.tasks.map((t) => t.id))

        state.tasks.forEach((_, id: string) => {
          if (!newTaskIds.has(id)) {
            state.tasks.delete(id)
          }
        })

        state.executionPlan.estimatedSteps = data.estimated_steps + 1

        data.tasks.forEach((taskInfo) => {
          if (!state.tasks.has(taskInfo.id)) {
            state.tasks.set(taskInfo.id, {
              ...taskInfo,
              status: taskInfo.status as TaskStatus,
              artifacts: []
            })
          }
        })
      } else {
        state.executionPlan = {
          executionPlanId: data.execution_plan_id,
          summary: data.summary,
          estimatedSteps: data.estimated_steps + 1,
          executionMode: data.execution_mode as 'sequential' | 'parallel',
          status: 'running'
        }

        state.tasks = new Map()
        data.tasks.forEach((taskInfo) => {
          state.tasks.set(taskInfo.id, {
            ...taskInfo,
            status: taskInfo.status as TaskStatus,
            artifacts: []
          })
        })
      }

      // 🔥 移除：state.isInitialized = true（这是 UISlice 的状态）
      // UI 初始化状态应由 UISlice 处理

      rebuildTasksCache(state)
    })
  },

  updateTasksFromPlan: (newPlan) => {
    set((state) => {
      // 🔥 修复：移除 executionPlan 检查，HITL 确认时执行计划可能未初始化
      // 直接更新 tasks Map，让 BusRail 能显示专家头像

      // 更新或创建 executionPlan（如果不存在）
      if (state.executionPlan) {
        state.executionPlan.estimatedSteps = newPlan.length + 1
      } else {
        // HITL 确认时 executionPlan 可能未初始化，创建临时 executionPlan
        state.executionPlan = {
          executionPlanId: `hitl-${Date.now()}`,
          summary: 'HITL 恢复执行',
          estimatedSteps: newPlan.length + 1,
          executionMode: 'sequential',
          status: 'running'
        }
      }

      const existingTaskStatuses = new Map<string, TaskStatus>()
      state.tasks.forEach((task, id) => {
        if (task.status === 'completed' || task.status === 'running') {
          existingTaskStatuses.set(id, task.status)
        }
      })

      const newTasks = new Map<string, Task>()
      newPlan.forEach((taskInfo) => {
        const existingStatus = existingTaskStatuses.get(taskInfo.id)
        const existingTask = state.tasks.get(taskInfo.id)
        newTasks.set(taskInfo.id, {
          id: taskInfo.id,
          expert_type: taskInfo.expert_type,
          description: taskInfo.description,
          status: existingStatus || (taskInfo.status as TaskStatus) || 'pending',
          sort_order: taskInfo.sort_order || 0,
          artifacts: existingTask?.artifacts || []
        })
      })

      state.tasks = newTasks

      rebuildTasksCache(state)
    })
  },

  startTask: (data: TaskStartedData) => {
    set((state) => {
      const task = state.tasks.get(data.task_id)
      if (task) {
        task.status = 'running'
        task.startedAt = data.started_at
      }

      // 🔥 移除：state.runningTaskIds.add(data.task_id)（这是 UISlice 的状态）
      // runningTaskIds 应由 UISlice 管理
      rebuildTasksCache(state)
    })
  },

  completeTask: (data: TaskCompletedData) => {
    set((state) => {
      const completedTask = state.tasks.get(data.task_id)
      if (completedTask) {
        completedTask.status = 'completed'
        completedTask.completedAt = data.completed_at
        completedTask.durationMs = data.duration_ms
        completedTask.output = data.output
      }

      // 🔥 移除：state.runningTaskIds.delete(data.task_id)（这是 UISlice 的状态）
      // 🔥 移除：selectedTaskId 修改（这是 UISlice 的状态）
      // 这些状态变更应由 UISlice 处理

      rebuildTasksCache(state)
    })
  },

  failTask: (data: TaskFailedData) => {
    set((state) => {
      const task = state.tasks.get(data.task_id)
      if (task) {
        task.status = 'failed'
        task.error = data.error
      }

      // 🔥 移除：state.runningTaskIds.delete(data.task_id)（这是 UISlice 的状态）

      rebuildTasksCache(state)
    })
  },

  addTask: (task: Task) => {
    set((state) => {
      state.tasks.set(task.id, task)
      rebuildTasksCache(state)
    })
  },

  updateTask: (taskId: string, updates: Partial<Task>) => {
    set((state) => {
      const task = state.tasks.get(taskId)
      if (task) {
        Object.assign(task, updates)
        rebuildTasksCache(state)
      }
    })
  },

  deleteTask: (taskId: string) => {
    set((state) => {
      state.tasks.delete(taskId)
      rebuildTasksCache(state)
    })
  },

  setTasks: (tasks: Map<string, Task>) => {
    set((state) => {
      state.tasks = tasks
      rebuildTasksCache(state)
    })
  },

  resetTasks: (force: boolean = false, hasRunningTasks?: () => boolean) => {
    set((state) => {
      // 🔥 保护：如果有运行中的任务，禁止重置（防止复杂模式执行中误重置）
      // 除非强制重置（force=true，用于从历史记录加载线程详情）
      // P0 修复：通过参数传入检查函数，避免直接访问 UISlice 状态
      if (!force && hasRunningTasks?.()) {
        logger.warn('[TaskStore] resetTasks 被阻止：有任务正在运行中')
        return
      }
      
      // 只清理 TaskSlice 自己的状态
      state.executionPlan = null
      state.tasks = new Map()
      state.tasksCache = []
      state.tasksCacheVersion++
    })
  },

  restoreFromExecutionPlan: (executionPlan: ApiExecutionPlan, subTasks: SubTask[]) => {
    set((state) => {
      // 使用 state 直接修改（Immer 会处理不可变性）
      state.executionPlan = {
        executionPlanId: executionPlan.execution_plan_id,
        summary: executionPlan.user_query || '',
        estimatedSteps: subTasks.length + 1,
        executionMode: 'sequential',
        status:
          (executionPlan.status as 'pending' | 'running' | 'completed' | 'failed') || 'running',
        // 🔥 保存 run_id 和 thread_id，用于跳转到时间线页面
        runId: executionPlan.run_id,
        threadId: executionPlan.thread_id,
      }

      state.tasks = new Map()

      subTasks.forEach((subTask, index) => {
        const taskStatus = (subTask.status as TaskStatus) || 'pending'

        const artifacts: Artifact[] = (subTask.artifacts || []).map((art, artIndex) => {
          const backendArtifact = art as Artifact & {
            sort_order?: number
            created_at?: string
          }

          return {
            id: art.id || `${subTask.id}-artifact-${artIndex}`,
            type: art.type || 'text',
            title: art.title || `${subTask.expert_type} Result`,
            content: art.content || '',
            language: art.language,
            sortOrder: backendArtifact.sortOrder ?? backendArtifact.sort_order ?? artIndex,
            createdAt:
              backendArtifact.createdAt ??
              backendArtifact.created_at ??
              new Date().toISOString()
          }
        })

        state.tasks.set(subTask.id, {
          id: subTask.id,
          expert_type: subTask.expert_type,
          description: subTask.task_description,
          status: taskStatus,
          sort_order: index,
          artifacts: artifacts,
          output: formatTaskOutput(subTask.output_result || subTask.output),
          error: subTask.error_message || subTask.error,
          durationMs: subTask.duration_ms
        })
      })

      // 移除以下跨 Slice 状态修改：
      // state.mode = 'complex'（UISlice 状态）
      // state.isInitialized = true（UISlice 状态）
      // state.selectedTaskId = ...（UISlice 状态）
      // 这些应由调用方（UISlice）处理

      rebuildTasksCache(state)
    })
  },

  syncTasksCache: () => {
    set((state) => {
      rebuildTasksCache(state)
    })
  }
})
