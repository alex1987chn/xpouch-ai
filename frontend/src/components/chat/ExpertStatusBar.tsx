import { forwardRef, useState } from 'react'
import React from 'react'
import { cn } from '@/lib/utils'
import { CheckCircle2, Clock2, AlertCircle, Trash2 } from 'lucide-react'
import { useCanvasStore, type ExpertResult } from '@/store/canvasStore'
import { getExpertConfig } from '@/constants/systemAgents'
import { DeleteConfirmDialog } from './DeleteConfirmDialog'

// 状态配置常量 - Bauhaus 风格
const STATUS_CONFIG = {
  pending: {
    border: 'border-[var(--border-color)]',
    bg: 'bg-[var(--bg-page)]',
    text: 'text-[var(--text-primary)]',
    indicator: 'bg-primary/50 dark:bg-primary/40'
  },
  running: {
    border: 'border-[var(--accent-hover)]',
    bg: 'bg-[var(--accent-hover)]/10',
    text: 'text-[var(--accent-hover)]',
    indicator: 'bg-[var(--accent-hover)]'
  },
  completed: {
    border: 'border-green-500',
    bg: 'bg-green-500/10',
    text: 'text-green-600 dark:text-green-400',
    indicator: 'bg-green-500'
  },
  failed: {
    border: 'border-red-500',
    bg: 'bg-red-500/10',
    text: 'text-red-600 dark:text-red-400',
    indicator: 'bg-red-500'
  }
} as const

// 状态图标组件
function StatusIcon({
  status,
  className = 'w-3 h-3'
}: {
  status: ExpertResult['status']
  className?: string
}) {
  const icons = {
    pending: null,
    running: <Clock2 className={`${className} animate-spin`} />,
    completed: <CheckCircle2 className={`${className}`} />,
    failed: <AlertCircle className={`${className}`} />
  }

  return icons[status]
}

// 专家卡片组件 - Bauhaus 方形风格
const ExpertCard = React.forwardRef<HTMLDivElement, {
  expert: ExpertResult
  onClick: () => void
  selected?: boolean
}>(({ expert, onClick, selected }, ref) => {
  const config = getExpertConfig(expert.expertType)
  const displayName = expert.title || config.name
  const shortName = displayName.slice(0, 2)
  const statusConfig = STATUS_CONFIG[expert.status]

  return (
    <div
      ref={ref}
      className="flex-shrink-0 cursor-pointer group"
      onClick={onClick}
    >
      <div className={cn(
        'relative w-12 h-12 flex items-center justify-center border-2 transition-all',
        'shadow-[var(--shadow-color)_2px_2px_0_0]',
        statusConfig.bg,
        statusConfig.border,
        selected && 'ring-2 ring-[var(--accent-hover)] ring-offset-2 ring-offset-[var(--bg-card)]',
        'hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[var(--shadow-color)_3px_3px_0_0]',
        'active:translate-x-0 active:translate-y-0 active:shadow-[var(--shadow-color)_2px_2px_0_0]'
      )}>
        {/* 专家名称前两个字 */}
        <span className={cn(
          'font-mono text-sm font-bold',
          statusConfig.text
        )}>
          {shortName}
        </span>

        {/* 状态指示器 - 左下角 */}
        <div className={cn(
          'absolute -bottom-1 -left-1 w-4 h-4 border-2 border-[var(--bg-card)] flex items-center justify-center',
          statusConfig.indicator
        )}>
          {expert.status === 'running' && (
            <div className="w-full h-full bg-[var(--accent-hover)] animate-pulse" />
          )}
          {expert.status === 'completed' && (
            <CheckCircle2 className="w-2.5 h-2.5 text-white" />
          )}
          {expert.status === 'failed' && (
            <AlertCircle className="w-2.5 h-2.5 text-white" />
          )}
        </div>

        {/* 选中指示 - 黄色方块 */}
        {selected && (
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-[var(--accent-hover)] border border-black" />
        )}
      </div>

      {/* 悬停提示 */}
      <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 px-2 py-1 bg-[var(--bg-card)] border border-[var(--border-color)] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
        <span className="font-mono text-[10px] whitespace-nowrap">{displayName}</span>
      </div>
    </div>
  )
})

ExpertCard.displayName = 'ExpertCard'

interface ExpertStatusBarProps {
  className?: string
}

export default function ExpertStatusBar({ className }: ExpertStatusBarProps) {
  const { expertResults, selectedExpert, selectExpert, selectArtifactSession, clearExpertResults } = useCanvasStore()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // 按执行顺序排序专家
  const sortedExperts = [...expertResults].sort((a, b) => {
    const order = ['pending', 'running', 'completed', 'failed']
    return order.indexOf(a.status) - order.indexOf(b.status)
  })

  // 处理专家卡片点击
  const handleExpertClick = (expertType: string) => {
    selectExpert(expertType)
    selectArtifactSession(expertType)
  }

  // 处理清除按钮点击
  const handleClearClick = () => {
    setShowDeleteConfirm(true)
  }

  // 确认清除
  const handleConfirmClear = async () => {
    clearExpertResults()
    selectArtifactSession(null)
    setShowDeleteConfirm(false)
  }

  // 统计
  const runningCount = sortedExperts.filter(e => e.status === 'running').length
  const completedCount = sortedExperts.filter(e => e.status === 'completed').length

  return (
    <div className={cn(
      'flex items-center gap-4 w-full overflow-hidden border-b-2 border-[var(--border-color)] bg-[var(--bg-page)] px-4 py-3',
      className
    )}>
      {/* 左侧标签 */}
      <div className="flex-shrink-0">
        <div className="font-mono text-[10px] text-primary/60 dark:text-primary/50 uppercase">
          /// EXPERTS
        </div>
        {sortedExperts.length > 0 && (
          <div className="flex items-center gap-2 mt-1">
            {runningCount > 0 && (
              <span className="font-mono text-[10px] text-[var(--accent-hover)]">
                {runningCount} RUNNING
              </span>
            )}
            {completedCount > 0 && (
              <span className="font-mono text-[10px] text-green-600 dark:text-green-500">
                {completedCount} DONE
              </span>
            )}
          </div>
        )}
      </div>

      {/* 空状态提示 - Bauhaus 风格 */}
      {sortedExperts.length === 0 && (
        <div className="flex items-center gap-2 flex-shrink-0 px-3 py-2 border-2 border-[var(--border-color)] bg-[var(--bg-card)]">
          <div className="w-2 h-2 bg-[var(--text-muted)] dark:bg-[var(--text-secondary)]/60 animate-pulse" />
          <span className="font-mono text-xs text-primary/60 dark:text-primary/50 uppercase">
            WAITING FOR SCHEDULER...
          </span>
        </div>
      )}

      {/* 专家卡片列表 */}
      <div className="flex items-center gap-3 flex-1 overflow-x-auto min-w-0 scrollbar-hide">
        {sortedExperts.map((expert) => (
          <ExpertCard
            key={expert.expertType}
            expert={expert}
            selected={expert.expertType === selectedExpert}
            onClick={() => handleExpertClick(expert.expertType)}
          />
        ))}
      </div>

      {/* 清除按钮 - Bauhaus 风格 */}
      {sortedExperts.length > 0 && (
        <button
          onClick={handleClearClick}
          className={cn(
            'flex-shrink-0 flex items-center gap-2 px-3 py-2 border-2 font-mono text-xs font-bold uppercase',
            'border-[var(--border-color)] text-primary/70 dark:text-primary/60',
            'hover:border-red-500 hover:text-red-500 hover:bg-red-500/10',
            'transition-all'
          )}
        >
          <Trash2 className="w-3 h-3" />
          CLEAR
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
