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
} from '@/hooks/useTaskSelectors'
import ArtifactDashboard from './ArtifactDashboard'

// 懒加载组件
const BusRail = lazy(() =>
  import('@/components/layout/ExpertRail/BusRail').then((m) => ({ default: m.default }))
)


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

  // 自动选中第一个任务
  useEffect(() => {
    if (tasks.length && !selectedTaskId) {
      selectTask(tasks[0].id)
    }
  }, [tasks, selectedTaskId, selectTask])

  return (
    <div className="flex-1 flex h-full bg-page relative">
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
