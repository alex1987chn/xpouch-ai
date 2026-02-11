/**
 * ComplexModePanel - 复杂模式面板
 * 
 * [职责]
 * 复杂模式下的核心面板：
 * - 左侧：ExpertRail (BusRail) 显示所有专家任务状态
 * - 右侧：ArtifactDashboard 显示产物
 * - 顶部/覆盖层：PlanReviewCard (HITL 审核卡片)
 * 
 * [数据获取]
 * 直连 useTaskStore 获取所有必要状态
 */

import { Suspense, lazy, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import {
  useTasksCache,
  useSelectedTaskId,
  useSelectTaskAction,
  useIsWaitingForApproval,
  usePendingPlan,
} from '@/hooks/useTaskSelectors'
import ArtifactDashboard from './ArtifactDashboard'

// 懒加载组件
const BusRail = lazy(() =>
  import('@/components/layout/ExpertRail/BusRail').then((m) => ({ default: m.default }))
)

// PlanReviewCard 可能需要额外的 props，暂时直接渲染条件
// const PlanReviewCard = lazy(() =>
//   import('@/components/chat/PlanReviewCard').then((m) => ({ default: m.default }))
// )

interface ComplexModePanelProps {
  isFullscreen?: boolean
  onToggleFullscreen?: () => void
}

export default function ComplexModePanel({
  isFullscreen,
  onToggleFullscreen,
}: ComplexModePanelProps) {
  // 从 Store 获取状态（使用性能优化后的 Selectors）
  const tasks = useTasksCache()
  const selectedTaskId = useSelectedTaskId()
  const selectTask = useSelectTaskAction()
  const isWaitingForApproval = useIsWaitingForApproval()
  const pendingPlan = usePendingPlan()

  // 自动选中第一个任务
  useEffect(() => {
    if (tasks.length && !selectedTaskId) {
      selectTask(tasks[0].id)
    }
  }, [tasks, selectedTaskId, selectTask])

  return (
    <div className="flex-1 flex h-full bg-page relative">
      {/* HITL Plan Review Card - 条件渲染在顶部 */}
      {/* TODO: PlanReviewCard 需要 conversationId 和 resumeExecution 参数 */}
      {/* 这些参数应从父组件传入或使用 chatStore 获取 */}
      {isWaitingForApproval && pendingPlan.length > 0 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-card border-2 border-border p-4 shadow-lg">
          <p className="text-sm font-mono">HITL Review Required</p>
          <p className="text-xs text-muted-foreground">{pendingPlan.length} tasks pending</p>
        </div>
      )}

      {/* 左侧：Expert Rail */}
      <Suspense
        fallback={
          <div className="w-20 border-r-2 border-border bg-page flex items-center justify-center">
            <Loader2 className="w-4 h-4 animate-spin" />
          </div>
        }
      >
        <BusRail
          tasks={tasks}
          selectedTaskId={selectedTaskId}
          onTaskClick={selectTask}
        />
      </Suspense>

      {/* 右侧：Artifact Dashboard */}
      <ArtifactDashboard
        isFullscreen={isFullscreen}
        onToggleFullscreen={onToggleFullscreen}
      />
    </div>
  )
}
