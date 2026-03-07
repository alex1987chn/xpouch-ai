/**
 * TaskStore 性能优化 Selectors
 * 
 * 使用 Zustand Selector 模式避免不必要的重渲染
 * 适用于高频更新场景（SSE 流式事件）
 */

import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useTaskStore } from '@/store/taskStore'
import type { Task } from '@/store/taskStore'

// ============================================================================
// 基础 Selectors (返回原始值)
// ============================================================================

/** 获取当前模式 */
export const useTaskMode = () => useTaskStore(state => state.mode)

/** 获取当前执行计划 */
export const useExecutionPlan = () => useTaskStore(state => state.session)

/** 获取选中的任务ID */
export const useSelectedTaskId = () => useTaskStore(state => state.selectedTaskId)

/** 获取任务初始化状态 */
export const useTaskInitialized = () => useTaskStore(state => state.isInitialized)

/** 获取等待审批状态 */
export const useIsWaitingForApproval = () => useTaskStore(state => state.isWaitingForApproval)

/** 获取待审批计划 */
export const usePendingPlan = () => useTaskStore(state => state.pendingPlan)

/** 获取待审批计划版本号（乐观锁） */
export const usePendingPlanVersion = () => useTaskStore(state => state.pendingPlanVersion)

/** 获取待审批运行 ID */
export const usePendingRunId = () => useTaskStore(state => state.pendingRunId)

/** 获取待审批执行计划 ID */
export const usePendingExecutionPlanId = () => useTaskStore(state => state.pendingExecutionPlanId)

/** 获取运行中的任务ID集合 */
export const useRunningTaskIds = () => useTaskStore(state => state.runningTaskIds)

/** 获取任务缓存版本号 (用于触发重渲染) */
export const useTasksCacheVersion = () => useTaskStore(state => state.tasksCacheVersion)

// ============================================================================
// 复杂 Selectors (使用 useShallow 进行浅比较)
// ============================================================================

/** 
 * 获取任务缓存数组
 * 使用 useShallow 因为返回的是数组引用
 */
export const useTasksCache = () => useTaskStore(
  useShallow(state => state.tasksCache)
)

/**
 * 获取所有任务 Map
 * 注意：只有在需要遍历所有任务时使用，通常 tasksCache 更合适
 */
export const useTasksMap = () => useTaskStore(
  useShallow(state => state.tasks)
)

/**
 * 获取选中任务的详细信息
 * 自动根据 selectedTaskId 查找对应的 Task 对象
 * 使用 useShallow 因为 find 会返回新的对象引用
 */
export const useSelectedTask = (): Task | undefined => useTaskStore(
  useShallow(state => {
    const { selectedTaskId, tasksCache } = state
    if (!selectedTaskId) return undefined
    return tasksCache.find(t => t.id === selectedTaskId)
  })
)

/**
 * 获取运行中的任务列表
 */
export const useRunningTasks = (): Task[] => useTaskStore(
  useShallow(state => {
    const { runningTaskIds, tasksCache } = state
    if (runningTaskIds.size === 0) return []
    return tasksCache.filter(t => runningTaskIds.has(t.id))
  })
)

/**
 * 获取任务统计信息
 * 返回一个稳定的对象，避免频繁重渲染
 */
export const useTaskStats = () => {
  const total = useTaskStore(state => state.tasksCache.length)
  const running = useTaskStore(state => state.runningTaskIds.size)
  const initialized = useTaskStore(state => state.isInitialized)
  const hasSession = useTaskStore(state => !!state.session)
  return useMemo(
    () => ({ total, running, initialized, hasSession }),
    [total, running, initialized, hasSession]
  )
}

// ============================================================================
// Actions Selectors (稳定引用，不会触发重渲染)
// ============================================================================

/**
 * 获取任务相关的 Actions
 * 使用 useShallow 返回一个稳定的 actions 对象
 */
export const useTaskActions = () => {
  const initializePlan = useTaskStore(state => state.initializePlan)
  const startTask = useTaskStore(state => state.startTask)
  const completeTask = useTaskStore(state => state.completeTask)
  const failTask = useTaskStore(state => state.failTask)
  const addArtifact = useTaskStore(state => state.addArtifact)
  const selectTask = useTaskStore(state => state.selectTask)
  const resetTasks = useTaskStore(state => state.resetTasks)
  const resetAll = useTaskStore(state => state.resetAll)
  const setMode = useTaskStore(state => state.setMode)
  const setIsInitialized = useTaskStore(state => state.setIsInitialized)
  const updateTasksFromPlan = useTaskStore(state => state.updateTasksFromPlan)
  const setPendingPlan = useTaskStore(state => state.setPendingPlan)
  const clearPendingPlan = useTaskStore(state => state.clearPendingPlan)
  const setIsWaitingForApproval = useTaskStore(state => state.setIsWaitingForApproval)
  const restoreFromSession = useTaskStore(state => state.restoreFromSession)
  const updateArtifactContent = useTaskStore(state => state.updateArtifactContent)

  return useMemo(
    () => ({
      initializePlan,
      startTask,
      completeTask,
      failTask,
      addArtifact,
      selectTask,
      resetTasks,
      resetAll,
      setMode,
      setIsInitialized,
      updateTasksFromPlan,
      setPendingPlan,
      clearPendingPlan,
      setIsWaitingForApproval,
      restoreFromSession,
      updateArtifactContent,
    }),
    [
      initializePlan,
      startTask,
      completeTask,
      failTask,
      addArtifact,
      selectTask,
      resetTasks,
      resetAll,
      setMode,
      setIsInitialized,
      updateTasksFromPlan,
      setPendingPlan,
      clearPendingPlan,
      setIsWaitingForApproval,
      restoreFromSession,
      updateArtifactContent,
    ]
  )
}

/**
 * 获取单个 Action (当只需要一个 action 时使用)
 */
export const useSelectTaskAction = () => useTaskStore(state => state.selectTask)
export const useResetTasksAction = () => useTaskStore(state => state.resetTasks)
export const useResetAllAction = () => useTaskStore(state => state.resetAll)
export const useInitializePlanAction = () => useTaskStore(state => state.initializePlan)

// ============================================================================
// 条件 Selectors (根据条件返回不同值)
// ============================================================================

/**
 * 根据任务ID获取任务详情
 * 用于 BusRail/ExpertRail 中的任务卡片
 */
export const useTaskById = (taskId: string | null): Task | undefined => {
  return useTaskStore(
    useShallow(state => {
      if (!taskId) return undefined
      return state.tasksCache.find(t => t.id === taskId)
    })
  )
}

/**
 * 检查指定任务是否正在运行
 */
export const useIsTaskRunning = (taskId: string): boolean => 
  useTaskStore(state => state.runningTaskIds.has(taskId))

/**
 * 获取任务的 artifacts
 */
export const useTaskArtifacts = (taskId: string) => 
  useTaskStore(
    useShallow(state => {
      const task = state.tasksCache.find(t => t.id === taskId)
      return task?.artifacts || []
    })
  )
