/**
 * TaskStore Selectors
 *
 * 只保留**有真实消费者**的 selector。
 *
 * 此前这里还有一整套针对 tasks / tasksCache / executionPlan / artifacts 的
 * selector（useTaskStats、useRunningTasks、useSelectedTask、useTaskById、
 * useTaskArtifacts、useTasksMap、useTasksCache、useExecutionPlan…），经逐个核对
 * **没有任何组件消费它们**——那批数据是「服务端运行数据的本地副本」，其唯一读者
 * 是 useSessionRestore 里的对账启发式（已移除）。任务与产物现以服务端为唯一真相
 * （/threads、/artifacts、/run/:id），因此不再提供本地副本 selector。
 *
 * 使用 Zustand selector 模式避免高频 SSE 更新下的多余重渲染。
 */

import { useMemo } from 'react'
import { useTaskStore } from '@/store/taskStore'

// ============================================================================
// 基础 Selectors（返回原始值）
// ============================================================================

/** 当前模式（simple / complex） */
export const useTaskMode = () => useTaskStore(state => state.mode)

/** 当前活跃运行 ID */
export const useActiveRunId = () => useTaskStore(state => state.activeRunId)

/** 是否等待人工审批 */
export const useIsWaitingForApproval = () => useTaskStore(state => state.isWaitingForApproval)

/** 待审批计划（审批卡渲染 + 执行步数来源） */
export const usePendingPlan = () => useTaskStore(state => state.pendingPlan)

/** HITL 修订中标志（驳回反馈已提交，专家修订 v(n+1) 中） */
export const usePlanRevising = () => useTaskStore(state => state.planRevising)

/** 待审批计划版本号（乐观锁） */
export const usePendingPlanVersion = () => useTaskStore(state => state.pendingPlanVersion)

/** 待审批运行 ID */
export const usePendingRunId = () => useTaskStore(state => state.pendingRunId)

/** 运行中的任务 ID 集合（消费方用它判「是否正在执行」） */
export const useRunningTaskIds = () => useTaskStore(state => state.runningTaskIds)

// ============================================================================
// Actions Selectors（稳定引用，不触发重渲染）
// ============================================================================

/**
 * 任务相关 Actions。
 *
 * 只暴露**有调用方**的：PlanReviewCard（计划审批与编辑）与 useChatCore（模式/运行 ID）。
 * 其余（initializePlan/startTask/completeTask/failTask/addArtifact/selectTask/
 * updateArtifactContent 等）没有任何调用方，连同本地任务副本一并停止使用。
 */
export const useTaskActions = () => {
  const updateTasksFromPlan = useTaskStore(state => state.updateTasksFromPlan)
  const setMode = useTaskStore(state => state.setMode)
  const setActiveRunId = useTaskStore(state => state.setActiveRunId)
  const clearActiveRunId = useTaskStore(state => state.clearActiveRunId)
  const setPendingPlan = useTaskStore(state => state.setPendingPlan)
  const clearPendingPlan = useTaskStore(state => state.clearPendingPlan)
  const setIsWaitingForApproval = useTaskStore(state => state.setIsWaitingForApproval)
  const setPlanRevising = useTaskStore(state => state.setPlanRevising)

  return useMemo(
    () => ({
      updateTasksFromPlan,
      setMode,
      setActiveRunId,
      clearActiveRunId,
      setPendingPlan,
      clearPendingPlan,
      setIsWaitingForApproval,
      setPlanRevising,
    }),
    [
      updateTasksFromPlan,
      setMode,
      setActiveRunId,
      clearActiveRunId,
      setPendingPlan,
      clearPendingPlan,
      setIsWaitingForApproval,
      setPlanRevising,
    ]
  )
}
