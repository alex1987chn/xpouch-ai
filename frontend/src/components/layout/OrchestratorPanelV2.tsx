/**
 * OrchestratorPanelV2 - 编排器面板 v3.2.0
 * 
 * [职责]
 * 主入口组件，仅负责根据 Store 中的 mode 进行条件渲染：
 * - Simple Mode: SimpleModePanel
 * - Complex Mode: ComplexModePanel
 * 
 * [架构升级]
 * v3.2.0: 采用极致拆分策略，所有业务逻辑下沉到子组件
 * - SimpleModePanel: 简单模式面板
 * - ComplexModePanel: 复杂模式面板（含 ExpertRail + ArtifactDashboard + PlanReviewCard）
 * - ArtifactDashboard: 共享的 Artifact 展示组件
 * 
 * [性能优化]
 * - 使用 React.lazy 按需加载模式组件
 * - 各子组件直连 Store，避免 Props Drilling
 */

import { Suspense, lazy } from 'react'
import { Loader2 } from 'lucide-react'
import { useTaskMode } from '@/hooks/useTaskSelectors'

// 懒加载模式组件
const SimpleModePanel = lazy(() => import('@/components/chat/mode/SimpleModePanel'))
const ComplexModePanel = lazy(() => import('@/components/chat/mode/ComplexModePanel'))

interface OrchestratorPanelV2Props {
  isFullscreen?: boolean
  onToggleFullscreen?: () => void
}

// 加载占位符
function PanelLoader() {
  return (
    <div className="flex-1 flex h-full bg-page items-center justify-center">
      <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Loading Panel...</span>
      </div>
    </div>
  )
}

export default function OrchestratorPanelV2({
  isFullscreen,
  onToggleFullscreen,
}: OrchestratorPanelV2Props) {
  const mode = useTaskMode()

  return (
    <Suspense fallback={<PanelLoader />}>
      {mode === 'complex' ? (
        <ComplexModePanel isFullscreen={isFullscreen} onToggleFullscreen={onToggleFullscreen} />
      ) : (
        <SimpleModePanel isFullscreen={isFullscreen} onToggleFullscreen={onToggleFullscreen} />
      )}
    </Suspense>
  )
}

// 导出 SimpleExpertRail 供 SimpleModePanel 使用
export function ExpertRailSimple({ hasArtifact }: { hasArtifact: boolean }) {
  const StatusIcon = ({ status }: { status: string }) => {
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
          <StatusIcon status={hasArtifact ? 'completed' : 'running'} />
        </div>
      </div>
      <div className="flex-1 w-[1px] bg-border/30 border-l border-dashed border-border/30 min-h-[20px] mt-4" />
    </div>
  )
}
