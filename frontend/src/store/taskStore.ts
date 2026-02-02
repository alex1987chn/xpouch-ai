/**
 * 任务状态管理 Store
 * 管理复杂模式下的专家任务状态和产物
 * 使用 Map 存储实现 O(1) 更新
 */

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { enableMapSet } from 'immer'
import { persist } from './middleware/persist'
import type {
  TaskInfo,
  PlanCreatedData,
  TaskStartedData,
  TaskCompletedData,
  TaskFailedData,
  ArtifactGeneratedData
} from '@/types/events'

// 启用 Immer 的 Map/Set 支持（必须在 create 之前调用）
enableMapSet()

// ============================================================================
// 类型定义
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

export interface Artifact {
  id: string
  type: 'code' | 'html' | 'markdown' | 'json' | 'text'
  title?: string
  content: string
  language?: string
  sortOrder: number
  createdAt: string
}

export interface TaskSession {
  sessionId: string
  summary: string
  estimatedSteps: number
  executionMode: 'sequential' | 'parallel'
  status: 'pending' | 'running' | 'completed' | 'failed'
}

interface TaskState {
  // 当前模式：simple | complex
  mode: 'simple' | 'complex' | null

  // 当前任务会话
  session: TaskSession | null

  // 任务存储（使用 Map 实现 O(1) 更新）
  tasks: Map<string, Task>

  // 缓存：排序后的任务数组（避免 selector 每次都创建新数组）
  tasksCache: Task[]
  tasksCacheVersion: number  // 缓存版本号，用于检测是否需要更新缓存

  // 当前运行的任务ID（支持并行）
  runningTaskIds: Set<string>

  // 选中的任务ID（用于展示产物）
  selectedTaskId: string | null

  // 是否已初始化
  isInitialized: boolean

  // Actions
  setMode: (mode: 'simple' | 'complex') => void
  initializePlan: (data: PlanCreatedData) => void
  updateTaskStatus: (taskId: string, status: TaskStatus) => void
  startTask: (data: TaskStartedData) => void
  completeTask: (data: TaskCompletedData) => void
  failTask: (data: TaskFailedData) => void
  addArtifact: (data: ArtifactGeneratedData) => void
  replaceArtifacts: (taskId: string, artifacts: Artifact[]) => void
  selectTask: (taskId: string | null) => void
  clearTasks: () => void

  // Computed（通过 get 方法实现）
  getPendingTasks: () => Task[]
  getRunningTasks: () => Task[]
  getCompletedTasks: () => Task[]
  getFailedTasks: () => Task[]
  getAllTasks: () => Task[]
  getSelectedTask: () => Task | null
  getSelectedTaskArtifacts: () => Artifact[]
  getProgress: () => number
  isTaskRunning: (taskId: string) => boolean
}

// ============================================================================
// Store 实现
// ============================================================================

export const useTaskStore = create<TaskState>()(
  // persist(
    immer((set, get) => ({
      // 初始状态
      mode: null,
      session: null,
      tasks: new Map(),
      tasksCache: [],  // 缓存：排序后的任务数组
      tasksCacheVersion: 0,  // 缓存版本号
      runningTaskIds: new Set(),
      selectedTaskId: null,
      isInitialized: false,

    /**
     * 设置模式
     * v3.0: 在 router.decision 事件后调用
     */
    setMode: (mode: 'simple' | 'complex') => {
      set((state) => {
        // 只在模式真正改变时才处理
        if (state.mode === mode) return
        
        state.mode = mode
        // 如果切换到 simple 模式，清空任务状态
        if (mode === 'simple') {
          state.session = null
          state.tasks = new Map()
          state.tasksCache = Object.freeze([])  // 清空缓存（冻结）
          state.tasksCacheVersion++
          state.runningTaskIds = new Set()
          state.isInitialized = false
        }
      })
    },

    // ========================================================================
    // Actions
    // ========================================================================

    /**
     * 初始化任务计划
     * 收到 plan.created 事件时调用
     */
    initializePlan: (data: PlanCreatedData) => {
      set((state) => {
        // 创建任务会话
        state.session = {
          sessionId: data.session_id,
          summary: data.summary,
          estimatedSteps: data.estimated_steps,
          executionMode: data.execution_mode as 'sequential' | 'parallel',
          status: 'running'
        }

        // 初始化任务 Map
        state.tasks = new Map()
        data.tasks.forEach((taskInfo) => {
          state.tasks.set(taskInfo.id, {
            ...taskInfo,
            status: taskInfo.status as TaskStatus,
            artifacts: []
          })
        })

        state.isInitialized = true
        state.runningTaskId = null
        state.selectedTaskId = null

        // 更新缓存（深拷贝避免 Immer proxy 被 revoke 后访问报错）
        const sortedTasks = Array.from(state.tasks.values())
          .sort((a, b) => a.sort_order - b.sort_order)
          .map(task => ({
            ...task,
            artifacts: task.artifacts.map(a => ({...a}))  // 深拷贝 artifact
          }))
        state.tasksCache = Object.freeze(sortedTasks)
        state.tasksCacheVersion++
      })
    },

    /**
     * 更新任务状态
     */
    updateTaskStatus: (taskId: string, status: TaskStatus) => {
      set((state) => {
        const task = state.tasks.get(taskId)
        if (task) {
          task.status = status
        }
      })
    },

    /**
     * 任务开始
     * 收到 task.started 事件时调用
     */
    startTask: (data: TaskStartedData) => {
      set((state) => {
        const task = state.tasks.get(data.task_id)
        if (task) {
          task.status = 'running'
          task.startedAt = data.started_at
        }
        state.runningTaskIds.add(data.task_id)
        // 更新缓存（深拷贝避免 Immer proxy 问题）
        state.tasksCache = Object.freeze(
          Array.from(state.tasks.values())
            .sort((a, b) => a.sort_order - b.sort_order)
            .map(task => ({
              ...task,
              artifacts: task.artifacts.map(a => ({...a}))
            }))
        )
        state.tasksCacheVersion++
      })
    },

    /**
     * 任务完成
     * 收到 task.completed 事件时调用
     */
    completeTask: (data: TaskCompletedData) => {
      set((state) => {
        const task = state.tasks.get(data.task_id)
        if (task) {
          task.status = 'completed'
          task.completedAt = data.completed_at
          task.durationMs = data.duration_ms
          task.output = data.output
        }
        state.runningTaskIds.delete(data.task_id)
        // 自动选中第一个完成的任务展示产物（只在未选中或选中不同任务时更新）
        if (!state.selectedTaskId && data.artifact_count > 0 && state.selectedTaskId !== data.task_id) {
          state.selectedTaskId = data.task_id
        }
        // 更新缓存（深拷贝避免 Immer proxy 问题）
        state.tasksCache = Object.freeze(
          Array.from(state.tasks.values())
            .sort((a, b) => a.sort_order - b.sort_order)
            .map(task => ({
              ...task,
              artifacts: task.artifacts.map(a => ({...a}))
            }))
        )
        state.tasksCacheVersion++
      })
    },

    /**
     * 任务失败
     * 收到 task.failed 事件时调用
     */
    failTask: (data: TaskFailedData) => {
      set((state) => {
        const task = state.tasks.get(data.task_id)
        if (task) {
          task.status = 'failed'
          task.error = data.error
        }
        state.runningTaskIds.delete(data.task_id)
        // 更新缓存（深拷贝避免 Immer proxy 问题）
        state.tasksCache = Object.freeze(
          Array.from(state.tasks.values())
            .sort((a, b) => a.sort_order - b.sort_order)
            .map(task => ({
              ...task,
              artifacts: task.artifacts.map(a => ({...a}))
            }))
        )
        state.tasksCacheVersion++
      })
    },

    /**
     * 添加产物
     * 收到 artifact.generated 事件时调用
     */
    addArtifact: (data: ArtifactGeneratedData) => {
      set((state) => {
        const task = state.tasks.get(data.task_id)
        if (task) {
          task.artifacts.push({
            id: data.artifact.id,
            type: data.artifact.type as Artifact['type'],
            title: data.artifact.title,
            content: data.artifact.content,
            language: data.artifact.language,
            sortOrder: data.artifact.sort_order,
            createdAt: new Date().toISOString()
          })
          // 按 sortOrder 排序
          task.artifacts.sort((a, b) => a.sortOrder - b.sortOrder)
        }
        // 自动选中该任务（只在未选中或选中不同任务时更新，避免无限循环）
        if (state.selectedTaskId !== data.task_id) {
          state.selectedTaskId = data.task_id
        }
        // 更新缓存（深拷贝避免 Immer proxy 问题）
        state.tasksCache = Object.freeze(
          Array.from(state.tasks.values())
            .sort((a, b) => a.sort_order - b.sort_order)
            .map(task => ({
              ...task,
              artifacts: task.artifacts.map(a => ({...a}))
            }))
        )
        state.tasksCacheVersion++
      })
    },

    /**
     * 替换任务的产物列表
     * 用于简单模式：每次预览时替换为新的 artifact
     */
    replaceArtifacts: (taskId: string, artifacts: Artifact[]) => {
      set((state) => {
        const task = state.tasks.get(taskId)
        if (task) {
          task.artifacts = artifacts
        }
        // 更新缓存（深拷贝避免 Immer proxy 问题）
        state.tasksCache = Object.freeze(
          Array.from(state.tasks.values())
            .sort((a, b) => a.sort_order - b.sort_order)
            .map(task => ({
              ...task,
              artifacts: task.artifacts.map(a => ({...a}))
            }))
        )
        state.tasksCacheVersion++
      })
    },

    /**
     * 选中任务
     */
    selectTask: (taskId: string | null) => {
      set((state) => {
        state.selectedTaskId = taskId
      })
    },

    /**
     * 清空所有任务
     */
    clearTasks: () => {
      set((state) => {
        state.mode = null
        state.session = null
        state.tasks = new Map()
        state.tasksCache = Object.freeze([])  // 清空缓存（冻结）
        state.tasksCacheVersion++
        state.runningTaskIds = new Set()
        state.selectedTaskId = null
        state.isInitialized = false
      })
    },

    // ========================================================================
    // Computed Getters
    // ========================================================================

    getPendingTasks: () => {
      const { tasks } = get()
      return Array.from(tasks.values())
        .filter((t) => t.status === 'pending')
        .sort((a, b) => a.sort_order - b.sort_order)
    },

    getRunningTasks: () => {
      const { tasks, runningTaskIds } = get()
      return Array.from(runningTaskIds)
        .map(id => tasks.get(id))
        .filter((t): t is Task => t !== undefined)
        .sort((a, b) => a.sort_order - b.sort_order)
    },

    isTaskRunning: (taskId: string) => {
      return get().runningTaskIds.has(taskId)
    },

    getCompletedTasks: () => {
      const { tasks } = get()
      return Array.from(tasks.values())
        .filter((t) => t.status === 'completed')
        .sort((a, b) => a.sort_order - b.sort_order)
    },

    getFailedTasks: () => {
      const { tasks } = get()
      return Array.from(tasks.values())
        .filter((t) => t.status === 'failed')
        .sort((a, b) => a.sort_order - b.sort_order)
    },

    getAllTasks: () => {
      const { tasksCache } = get()
      return tasksCache
    },

    getSelectedTask: () => {
      const { tasks, selectedTaskId } = get()
      if (!selectedTaskId) return null
      return tasks.get(selectedTaskId) || null
    },

    getSelectedTaskArtifacts: () => {
      const task = get().getSelectedTask()
      return task?.artifacts || []
    },

    getProgress: () => {
      const { tasks, session } = get()
      if (!session) return 0
      const total = tasks.size
      if (total === 0) return 0
      const completed = Array.from(tasks.values()).filter(
        (t) => t.status === 'completed' || t.status === 'failed'
      ).length
      return Math.round((completed / total) * 100)
    }
  }))
  // persist 配置暂时禁用，测试无限循环问题
  // {
  //   name: 'xpouch-task-store',
  //   version: 1,
  //   // 只持久化关键字段
  //   partialize: (state) => ({
  //     session: state.session,
  //     tasks: Array.from(state.tasks.entries()),
  //     selectedTaskId: state.selectedTaskId,
  //     isInitialized: state.isInitialized
  //   }),
  //   // 自定义序列化：处理 Map
  //   serialize: (state) => JSON.stringify(state),
  //   deserialize: (str) => {
  //     const parsed = JSON.parse(str)
  //     // 恢复 Map
  //     if (parsed.tasks && Array.isArray(parsed.tasks)) {
  //       parsed.tasks = new Map(parsed.tasks)
  //     }
  //     return parsed
  //   }
  // }
  // )
)

// 只导出 useTaskStore，组件中直接使用
// 例：const mode = useTaskStore((state) => state.mode)
