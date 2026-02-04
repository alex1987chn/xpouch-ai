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
import type { SubTask, TaskSession as ApiTaskSession } from '@/types'

// 启用 Immer 的 Map/Set 支持（必须在 create 之前调用）
enableMapSet()

// ============================================================================
// Helper 函数
// ============================================================================

/**
 * 格式化任务输出：将后端复杂的 output_result 转为 Markdown 字符串
 */
const formatTaskOutput = (outputResult: any): string => {
  if (!outputResult) return ''

  // 如果已经是字符串，直接返回
  if (typeof outputResult === 'string') return outputResult

  // 提取核心内容
  let formattedText = outputResult.content || ''

  // 处理来源 (Source) - 适配 Search Expert 的输出结构
  if (outputResult.source && Array.isArray(outputResult.source) && outputResult.source.length > 0) {
    formattedText += '\n\n---\n**参考来源：**\n'
    outputResult.source.forEach((src: any, index: number) => {
      // 容错处理，防止 src 为空
      const title = src.title || '未知来源'
      const url = src.url || '#'
      formattedText += `> ${index + 1}. [${title}](${url})\n`
    })
  }
  // 兼容其他可能的字段名
  else if (outputResult.sources) {
    formattedText += '\n\n**参考资料:** ' + JSON.stringify(outputResult.sources)
  }

  return formattedText
}

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
  restoreFromSession: (session: ApiTaskSession, subTasks: SubTask[]) => void

  // Computed（通过 get 方法实现）
  getSelectedTask: () => Task | null
  getSelectedTaskArtifacts: () => Artifact[]
}

// ============================================================================
// Store 实现
// ============================================================================

export const useTaskStore = create<TaskState>()(
  persist(
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
          state.tasksCache = []  // 清空缓存
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
        state.tasksCache = sortedTasks
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
        state.tasksCache =
          Array.from(state.tasks.values())
            .sort((a, b) => a.sort_order - b.sort_order)
            .map(task => ({
              ...task,
              artifacts: task.artifacts.map(a => ({...a}))
            }))
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
        state.tasksCache =
          Array.from(state.tasks.values())
            .sort((a, b) => a.sort_order - b.sort_order)
            .map(task => ({
              ...task,
              artifacts: task.artifacts.map(a => ({...a}))
            }))
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
        state.tasksCache =
          Array.from(state.tasks.values())
            .sort((a, b) => a.sort_order - b.sort_order)
            .map(task => ({
              ...task,
              artifacts: task.artifacts.map(a => ({...a}))
            }))
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
        state.tasksCache =
          Array.from(state.tasks.values())
            .sort((a, b) => a.sort_order - b.sort_order)
            .map(task => ({
              ...task,
              artifacts: task.artifacts.map(a => ({...a}))
            }))
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
        state.tasksCache =
          Array.from(state.tasks.values())
            .sort((a, b) => a.sort_order - b.sort_order)
            .map(task => ({
              ...task,
              artifacts: task.artifacts.map(a => ({...a}))
            }))
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
        state.tasksCache = []  // 清空缓存
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
    restoreFromSession: (session: ApiTaskSession, subTasks: SubTask[]) => {
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
            // 👈 修复字段映射：后端 output_result -> 前端 output
            output: formatTaskOutput(subTask.output_result || subTask.output),
            // 👈 修复字段映射：后端 error_message -> 前端 error
            error: subTask.error_message || subTask.error,
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
        state.tasksCache =
          sortedTasks.map(task => ({
            ...task,
            artifacts: task.artifacts.map(a => ({...a}))
          }))
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
  })),
  // ============================================================================
  // Persist 配置
  // ============================================================================
  // 注意：persist 配置暂时禁用，测试无限循环问题
  {
    name: 'xpouch-task-store',
    version: 1,
    // 只持久化关键字段
    partialize: (state: TaskState): any => ({
      session: state.session,
      tasks: Array.from(state.tasks.entries()),
      runningTaskIds: Array.from(state.runningTaskIds),
      selectedTaskId: state.selectedTaskId,
      isInitialized: state.isInitialized
    }),
    // 自定义序列化：处理 Map/Set
    serialize: (state: any) => {
      try {
        // partialize 已经把 Map/Set 转换为数组
        // tasks: [['taskId1', task1], ['taskId2', task2]]
        // runningTaskIds: ['taskId1', 'taskId2']
        const serialized = JSON.stringify(state)
        console.log('[TaskStore] serialize 成功:', {
          tasksCount: state.tasks?.length || 0,
          runningTaskIdsCount: state.runningTaskIds?.length || 0,
          hasSession: !!state.session,
          isInitialized: state.isInitialized
        })
        return serialized
      } catch (error) {
        console.error('[TaskStore] serialize 失败:', error)
        throw error
      }
    },
    deserialize: (str: string) => {
      try {
        if (!str) {
          console.warn('[TaskStore] deserialize: 空字符串，返回空对象')
          return {}
        }

        const parsed = JSON.parse(str)

        // 恢复 Map: [['key', value], ...] => Map
        if (parsed.tasks && Array.isArray(parsed.tasks)) {
          parsed.tasks = new Map(parsed.tasks)
          console.log('[TaskStore] deserialize: 恢复 Map, 任务数:', parsed.tasks.size)
        } else {
          // 如果tasks不存在或不是数组，创建空Map
          parsed.tasks = new Map()
          console.warn('[TaskStore] deserialize: tasks 无效，创建空 Map')
        }

        // 恢复 Set: ['id1', 'id2', ...] => Set
        if (parsed.runningTaskIds && Array.isArray(parsed.runningTaskIds)) {
          parsed.runningTaskIds = new Set(parsed.runningTaskIds)
          console.log('[TaskStore] deserialize: 恢复 Set, 运行中任务数:', parsed.runningTaskIds.size)
        } else {
          // 如果runningTaskIds不存在或不是数组，创建空Set
          parsed.runningTaskIds = new Set()
          console.warn('[TaskStore] deserialize: runningTaskIds 无效，创建空 Set')
        }

        return parsed
      } catch (error) {
        console.error('[TaskStore] deserialize 失败:', error)
        // 返回一个安全的默认状态
        return {
          session: null,
          tasks: new Map(),
          runningTaskIds: new Set(),
          selectedTaskId: null,
          isInitialized: false
        }
      }
    }
  }
  )
)

// 只导出 useTaskStore，组件中直接使用
// 例：const mode = useTaskStore((state) => state.mode)
