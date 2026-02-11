/**
 * SimpleModePanel - 简单模式面板
 * 
 * [职责]
 * 简单模式下的右侧面板，仅显示单个 ArtifactDashboard
 * 
 * [数据获取]
 * 直连 useTaskStore 获取简单模式下的任务状态
 */

import { SIMPLE_TASK_ID } from '@/constants/task'
import { useTasksCache } from '@/hooks/useTaskSelectors'
import ArtifactDashboard from './ArtifactDashboard'

// 简单的 ExpertRail 组件
function SimpleExpertRail({ hasArtifact }: { hasArtifact: boolean }) {
  const StatusIndicator = ({ status }: { status: string }) => {
    if (status === 'running') {
      return <div className="w-3 h-3 border-2 border-yellow-500 border-t-transparent animate-spin rounded-full" />
    }
    if (status === 'completed') {
      return <div className="w-3 h-3 bg-green-500 rounded-full" />
    }
    return <div className="w-3 h-3 bg-muted-foreground rounded-full" />
  }

  return (
    <div className="w-14 border-r-2 border-border bg-page flex flex-col items-center py-2 shrink-0">
      <div className="w-[1px] h-4 bg-border/50 mb-2" />
      <div className="relative group">
        <div className="w-10 h-10 border-2 border-border bg-card shadow-[2px_2px_0_0_rgba(0,0,0,0.2)] flex items-center justify-center">
          <span className="font-black text-xs text-primary">AI</span>
        </div>
        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-card rounded-full flex items-center justify-center">
          <StatusIndicator status={hasArtifact ? 'completed' : 'running'} />
        </div>
      </div>
      <div className="flex-1 w-[1px] bg-border/30 border-l border-dashed border-border/30 min-h-[20px] mt-4" />
    </div>
  )
}

interface SimpleModePanelProps {
  isFullscreen?: boolean
  onToggleFullscreen?: () => void
}

export default function SimpleModePanel({
  isFullscreen,
  onToggleFullscreen,
}: SimpleModePanelProps) {
  const tasks = useTasksCache()
  const simpleTask = tasks.find((t) => t.id === SIMPLE_TASK_ID)
  const hasArtifact = (simpleTask?.artifacts?.length || 0) > 0

  return (
    <div className="flex-1 flex h-full bg-page">
      <SimpleExpertRail hasArtifact={hasArtifact} />
      <ArtifactDashboard isFullscreen={isFullscreen} onToggleFullscreen={onToggleFullscreen} />
    </div>
  )
}
