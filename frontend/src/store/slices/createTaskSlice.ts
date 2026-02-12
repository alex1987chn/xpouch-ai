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
import type { TaskSession as ApiTaskSession, SubTask, Artifact } from '@/types'

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

export interface TaskSession {
  sessionId: string
  summary: string
  estimatedSteps: number
  executionMode: 'sequential' | 'parallel'
  status: 'pending' | 'running' | 'completed' | 'failed'
}

// ============================================================================
// State & Actions Interfaces
// ============================================================================

export interface TaskSliceState {
  session: TaskSession | null
  tasks: Map<string, Task>
  tasksCache: Task[]
  tasksCacheVersion: number
}

export interface TaskSliceActions {
  // Mode & Session
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
  
  // Session restore
  restoreFromSession: (session: ApiTaskSession, subTasks: SubTask[]) => void
  
  // Clear all tasks
  clearTasks: (force?: boolean) => void
  
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

const formatTaskOutput = (outputResult: any): string => {
  if (!outputResult) return ''
  if (typeof outputResult === 'string') return outputResult

  let formattedText = outputResult.content || ''

  if (outputResult.source && Array.isArray(outputResult.source) && outputResult.source.length > 0) {
    formattedText += '\n\n---\n**Sources:**\n'
    outputResult.source.forEach((src: any, index: number) => {
      const title = src.title || 'Unknown Source'
      const url = src.url || '#'
      formattedText += `> ${index + 1}. [${title}](${url})\n`
    })
  } else if (outputResult.sources) {
    formattedText += '\n\n**References:** ' + JSON.stringify(outputResult.sources)
  }

  return formattedText
}

// ============================================================================
// Slice Factory
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const createTaskSlice = (set: any, get: any): TaskSlice => ({
  // Initial state
  session: null,
  tasks: new Map(),
  tasksCache: [],
  tasksCacheVersion: 0,

  // Actions

  setMode: (mode: 'simple' | 'complex') => {
    set((state: any) => {
      if (state.mode === mode) return

      if (mode === 'simple') {
        state.session = null
        state.tasks = new Map()
        rebuildTasksCache(state)
        state.runningTaskIds = new Set()
        state.isInitialized = false
        state.planThinkingContent = ''
        state.isWaitingForApproval = false
        state.pendingPlan = []
      }
      
      state.mode = mode
    })
  },

  initializePlan: (data: PlanCreatedData) => {
    set((state: any) => {
      if (state.session?.sessionId === data.session_id) {
        const newTaskIds = new Set(data.tasks.map((t: any) => t.id))

        state.tasks.forEach((_: any, id: string) => {
          if (!newTaskIds.has(id)) {
            state.tasks.delete(id)
          }
        })

        state.session.estimatedSteps = data.estimated_steps + 1

        data.tasks.forEach((taskInfo: any) => {
          if (!state.tasks.has(taskInfo.id)) {
            state.tasks.set(taskInfo.id, {
              ...taskInfo,
              status: taskInfo.status as TaskStatus,
              artifacts: []
            })
          }
        })
      } else {
        state.session = {
          sessionId: data.session_id,
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

      state.isInitialized = true

      rebuildTasksCache(state)
    })
  },

  updateTasksFromPlan: (newPlan) => {
    set((state: any) => {
      // 🔥 修复：移除 session 检查，HITL 确认时 session 可能未初始化
      // 直接更新 tasks Map，让 BusRail 能显示专家头像

      // 更新或创建 session（如果不存在）
      if (state.session) {
        state.session.estimatedSteps = newPlan.length + 1
      } else {
        // HITL 确认时 session 可能未初始化，创建临时 session
        state.session = {
          sessionId: `hitl-${Date.now()}`,
          summary: 'HITL 恢复执行',
          estimatedSteps: newPlan.length + 1,
          executionMode: 'sequential',
          status: 'running'
        }
      }

      const existingTaskStatuses = new Map<string, TaskStatus>()
      state.tasks.forEach((task: any, id: string) => {
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
    set((state: any) => {
      const task = state.tasks.get(data.task_id)
      if (task) {
        task.status = 'running'
        task.startedAt = data.started_at
      }

      state.runningTaskIds.add(data.task_id)
      rebuildTasksCache(state)
    })
  },

  completeTask: (data: TaskCompletedData) => {
    set((state: any) => {
      const completedTask = state.tasks.get(data.task_id)
      if (completedTask) {
        completedTask.status = 'completed'
        completedTask.completedAt = data.completed_at
        completedTask.durationMs = data.duration_ms
        completedTask.output = data.output
      }

      state.runningTaskIds.delete(data.task_id)

      if (!state.selectedTaskId && data.artifact_count > 0) {
        state.selectedTaskId = data.task_id
      }

      rebuildTasksCache(state)
    })
  },

  failTask: (data: TaskFailedData) => {
    set((state: any) => {
      const task = state.tasks.get(data.task_id)
      if (task) {
        task.status = 'failed'
        task.error = data.error
      }

      state.runningTaskIds.delete(data.task_id)

      rebuildTasksCache(state)
    })
  },

  addTask: (task: Task) => {
    set((state: any) => {
      state.tasks.set(task.id, task)
      rebuildTasksCache(state)
    })
  },

  updateTask: (taskId: string, updates: Partial<Task>) => {
    set((state: any) => {
      const task = state.tasks.get(taskId)
      if (task) {
        Object.assign(task, updates)
        rebuildTasksCache(state)
      }
    })
  },

  deleteTask: (taskId: string) => {
    set((state: any) => {
      state.tasks.delete(taskId)
      rebuildTasksCache(state)
    })
  },

  setTasks: (tasks: Map<string, Task>) => {
    set((state: any) => {
      state.tasks = tasks
      rebuildTasksCache(state)
    })
  },

  clearTasks: (force: boolean = false) => {
    set((state: any) => {
      // 🔥 保护：如果有运行中的任务，禁止清空（防止复杂模式执行中误清空）
      // 除非强制清空（force=true，用于从历史记录加载会话）
      if (!force && state.runningTaskIds && state.runningTaskIds.size > 0) {
        console.warn('[TaskStore] clearTasks 被阻止：有任务正在运行中', {
          runningCount: state.runningTaskIds.size,
          runningIds: Array.from(state.runningTaskIds)
        })
        return
      }
      
      // 只清理 TaskSlice 自己的状态
      state.session = null
      state.tasks = new Map()
      state.tasksCache = []
      state.tasksCacheVersion++
    })
  },

  restoreFromSession: (session: ApiTaskSession, subTasks: SubTask[]) => {
    set((state: any) => {
      // 使用 state 直接修改（Immer 会处理不可变性）
      state.session = {
        sessionId: session.session_id,
        summary: session.user_query || '',
        estimatedSteps: subTasks.length + 1,
        executionMode: 'sequential',
        status: (session.status as 'pending' | 'running' | 'completed' | 'failed') || 'running'
      }

      state.tasks = new Map()
      state.runningTaskIds = new Set()

      subTasks.forEach((subTask, index) => {
        const taskStatus = (subTask.status as TaskStatus) || 'pending'
        if (taskStatus === 'running') {
          state.runningTaskIds.add(subTask.id)
        }

        const artifacts: Artifact[] = (subTask.artifacts || []).map((art: any, artIndex: number) => ({
          id: art.id || `${subTask.id}-artifact-${artIndex}`,
          type: art.type || 'text',
          title: art.title || `${subTask.expert_type} Result`,
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
          output: formatTaskOutput(subTask.output_result || subTask.output),
          error: subTask.error_message || subTask.error,
          durationMs: subTask.duration_ms
        })
      })

      state.mode = 'complex'
      state.isInitialized = true

      const sortedTasks = Array.from(state.tasks.values())
        .sort((a: any, b: any) => a.sort_order - b.sort_order)

      const firstTaskWithArtifacts = sortedTasks.find((t: any) => t.artifacts && t.artifacts.length > 0)
      state.selectedTaskId = (firstTaskWithArtifacts as any)?.id || (sortedTasks[0] as any)?.id || null

      rebuildTasksCache(state)
    })
  },

  syncTasksCache: () => {
    set((state: any) => {
      rebuildTasksCache(state)
    })
  }
})
