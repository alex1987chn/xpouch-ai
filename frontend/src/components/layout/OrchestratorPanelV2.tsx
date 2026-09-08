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
    <div className="flex-1 flex h-full bg-surface-page items-center justify-center">
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

// 注意：SimpleModePanel 使用自己的 SimpleExpertRail（本地实现），此处不再导出孪生组件
