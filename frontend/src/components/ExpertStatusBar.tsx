import { forwardRef, useState } from 'react'
import React from 'react'
import { cn } from '@/lib/utils'
import { CheckCircle2, Clock2, AlertCircle } from 'lucide-react'
import { useCanvasStore, type ExpertResult } from '@/store/canvasStore'
import { getExpertConfig } from '@/constants/systemAgents'
import { DeleteConfirmDialog } from './DeleteConfirmDialog'
import { Badge } from '@/components/ui/badge'

// 状态配置常量
const STATUS_COLORS = {
  pending: 'bg-gray-200 dark:bg-gray-700',
  running: 'bg-green-500 animate-pulse',
  completed: 'bg-green-500',
  failed: 'bg-red-500'
} as const

// 状态图标组件
function StatusIcon({
  status,
  className = 'w-5 h-5'
}: {
  status: ExpertResult['status']
  className?: string
}) {
  const icons = {
    pending: null,
    running: <Clock2 className={`${className} text-white`} />,
    completed: <CheckCircle2 className={`${className} text-white`} />,
    failed: <AlertCircle className={`${className} text-white`} />
  }

  return icons[status]
}

// 专家卡片组件 - 圆形头像样式
const ExpertCard = React.forwardRef<HTMLDivElement, {
  expert: ExpertResult
  onClick: () => void
  selected?: boolean
}>(({ expert, onClick, selected }, ref) => {
  const config = getExpertConfig(expert.expertType)
  const displayName = expert.title || config.name
  const shortName = displayName.slice(0, 2) // 只显示前两个字

  return (
    <div
      ref={ref}
      className={cn(
        'flex-shrink-0 cursor-pointer transition-all duration-300'
      )}
      onClick={onClick}
    >
      <div className={cn(
        'relative flex items-center justify-center w-12 h-12 rounded-full border-2 transition-all duration-300',
        'bg-card',
        'hover:scale-110 hover:shadow-lg',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50',
        expert.status === 'running' && 'border-amber-400',
        expert.status === 'completed' && 'border-green-400',
        expert.status === 'failed' && 'border-red-400',
        expert.status === 'pending' && 'border-slate-300 dark:border-slate-600',
        selected && 'border-violet-400 ring-2 ring-violet-500/20'
      )}>
        {/* 专家名称前两个字 */}
        <span className={cn(
          'text-sm font-semibold',
          expert.status === 'completed' && 'text-green-600 dark:text-green-400',
          expert.status === 'failed' && 'text-red-600 dark:text-red-400',
          expert.status === 'running' && 'text-amber-600 dark:text-amber-400',
          (expert.status === 'pending' || !expert.status) && 'text-slate-600 dark:text-slate-400'
        )}>
          {shortName}
        </span>

        {/* 状态指示（完成时显示勾选） */}
        {expert.status === 'completed' && (
          <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center border-2 border-card shadow-sm">
            <CheckCircle2 className="w-2.5 h-2.5 text-white" />
          </div>
        )}

        {/* 状态指示（失败时显示X） */}
        {expert.status === 'failed' && (
          <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center border-2 border-card shadow-sm">
            <AlertCircle className="w-2.5 h-2.5 text-white" />
          </div>
        )}

        {/* 状态指示（运行时显示脉冲） */}
        {expert.status === 'running' && (
          <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-amber-500 rounded-full flex items-center justify-center border-2 border-card shadow-sm animate-pulse">
            <Clock2 className="w-2.5 h-2.5 text-white" />
          </div>
        )}
      </div>
    </div>
  )
})

ExpertCard.displayName = 'ExpertCard'

interface ExpertStatusBarProps {
  className?: string
}

export default function ExpertStatusBar({ className }: ExpertStatusBarProps) {
  const { expertResults, selectedExpert, selectExpert, selectArtifactSession, clearExpertResults, artifactSessions } = useCanvasStore()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // 按执行顺序排序专家
  const sortedExperts = [...expertResults].sort((a, b) => {
    const order = ['pending', 'running', 'completed', 'failed']
    return order.indexOf(a.status) - order.indexOf(b.status)
  })

  // 处理专家卡片点击：同时更新专家选中状态和 artifact 会话状态
  const handleExpertClick = (expertType: string) => {
    selectExpert(expertType)
    selectArtifactSession(expertType)
  }

  // 处理清除按钮点击：显示确认弹窗
  const handleClearClick = () => {
    setShowDeleteConfirm(true)
  }

  // 确认清除
  const handleConfirmClear = async () => {
    clearExpertResults()
    selectArtifactSession(null)
    setShowDeleteConfirm(false)
  }

  return (
    <div className={cn(
      'flex items-center gap-3 w-full max-w-full overflow-x-auto pb-2 min-h-[60px] px-4 py-3',
      'bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm',
      'rounded-2xl border border-gray-200 dark:border-slate-700',
      'shadow-lg',
      className
    )}>
      {/* 空状态提示 */}
      {sortedExperts.length === 0 && (
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 flex-shrink-0">
          <span className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600 animate-pulse"></span>
          <span>等待专家调度...</span>
        </div>
      )}

      {/* 专家卡片列表，宽度约束 */}
      <div className="flex items-center gap-3 min-w-0 flex-1 overflow-x-auto">
        {sortedExperts.map((expert) => (
          <ExpertCard
            key={expert.expertType}
            expert={expert}
            selected={expert.expertType === selectedExpert}
            onClick={() => handleExpertClick(expert.expertType)}
          />
        ))}
      </div>

      {/* 清除按钮 */}
      {sortedExperts.length > 0 && (
        <button
          onClick={handleClearClick}
          className="ml-auto flex-shrink-0 px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700"
        >
          清除
        </button>
      )}

      {/* 全局删除确认弹窗 */}
      <DeleteConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleConfirmClear}
        title="清除专家结果"
        description="确定要清除所有专家状态和交付物吗？"
      />
    </div>
  )
}

