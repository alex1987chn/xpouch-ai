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
import type { TaskSession, SubTask } from '@/types'

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
  startTask: (data: TaskStartedData) => void
  completeTask: (data: TaskCompletedData) => void
  failTask: (data: TaskFailedData) => void
  addArtifact: (data: ArtifactGeneratedData) => void
  replaceArtifacts: (taskId: string, artifacts: Artifact[]) => void
  selectTask: (taskId: string | null) => void
  clearTasks: () => void
  
  /**
   * 从会话数据恢复任务状态（用于页面切换后状态恢复）
   * v3.0: 状态恢复/水合 (State Rehydration)
   */
  restoreFromSession: (session: TaskSession, subTasks: SubTask[]) => void

  // Computed（通过 get 方法实现）
  getSelectedTask: () => Task | null
  getSelectedTaskArtifacts: () => Artifact[]
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
        state.runningTaskIds = new Set()
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

    /**
     * 从会话数据恢复任务状态（用于页面切换后状态恢复）
     * v3.0: 状态恢复/水合 (State Rehydration)
     * 
     * 根据 Gemini 的建议：
     * - 不追求事件回放，直接拉取最新状态
     * - 利用数据库作为天然缓存
     * - 用户切回来时看到最新进度即可
     */
    restoreFromSession: (session: TaskSession, subTasks: SubTask[]) => {
      set((state) => {
        // 1. 设置任务会话
        state.session = {
          sessionId: session.session_id,
          summary: session.user_query || '',
          estimatedSteps: subTasks.length,
          executionMode: 'sequential',
          status: (session.status as 'pending' | 'running' | 'completed' | 'failed') || 'running'
        }

        // 2. 重建任务 Map
        state.tasks = new Map()
        let hasRunningTask = false

        subTasks.forEach((subTask, index) => {
          const taskStatus = (subTask.status as TaskStatus) || 'pending'
          if (taskStatus === 'running') {
            hasRunningTask = true
          }

          // 转换 artifact 数据
          const artifacts: Artifact[] = (subTask.artifacts || []).map((art: any, artIndex: number) => ({
            id: art.id || `${subTask.id}-artifact-${artIndex}`,
            type: art.type || 'text',
            title: art.title || `${subTask.expert_type}结果`,
            content: art.content || '',
            language: art.language,
            sortOrder: art.sort_order || artIndex,
            createdAt: art.created_at || new Date().toISOString()
          }))

          state.tasks.set(subTask.id, {
            id: subTask.id,
            expert_type: subTask.expert_type,
            description: subTask.task_description,
            status: taskStatus,
            sort_order: index,
            artifacts: artifacts,
            output: subTask.output,
            error: subTask.error,
            startedAt: undefined,
            completedAt: undefined,
            durationMs: subTask.duration_ms
          })

          // 更新运行中任务集合
          if (taskStatus === 'running') {
            state.runningTaskIds.add(subTask.id)
          }
        })

        // 3. 设置模式
        state.mode = 'complex'
        state.isInitialized = true

        // 4. 自动选中第一个有产物的任务（或第一个任务）
        const sortedTasks = Array.from(state.tasks.values())
          .sort((a, b) => a.sort_order - b.sort_order)
        
        const firstTaskWithArtifacts = sortedTasks.find(t => t.artifacts.length > 0)
        state.selectedTaskId = firstTaskWithArtifacts?.id || sortedTasks[0]?.id || null

        // 5. 更新缓存
        state.tasksCache = Object.freeze(
          sortedTasks.map(task => ({
            ...task,
            artifacts: task.artifacts.map(a => ({...a}))
          }))
        )
        state.tasksCacheVersion++

        console.log('[TaskStore] 状态恢复完成:', {
          sessionId: session.session_id,
          taskCount: subTasks.length,
          runningTasks: state.runningTaskIds.size,
          hasRunningTask
        })
      })
    },

    // ========================================================================
    // Computed Getters
    // ========================================================================

    getSelectedTask: () => {
      const { tasks, selectedTaskId } = get()
      if (!selectedTaskId) return null
      return tasks.get(selectedTaskId) || null
    },

    getSelectedTaskArtifacts: () => {
      const task = get().getSelectedTask()
      return task?.artifacts || []
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
