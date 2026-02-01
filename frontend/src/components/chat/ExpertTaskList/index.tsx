/**
 * 专家任务列表组件 (ExpertTaskList)
 */

import React from 'react'
import { cn } from '@/lib/utils'
import { useTaskStore } from '@/store/taskStore'
import { Loader2, CheckCircle2, XCircle, Clock, FileText } from 'lucide-react'

interface TaskCardProps {
  expertType: string
  description: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  sortOrder: number
  durationMs?: number
  artifactCount: number
  isSelected: boolean
  onClick: () => void
}

function TaskCard({
  expertType,
  description,
  status,
  sortOrder,
  durationMs,
  artifactCount,
  isSelected,
  onClick
}: TaskCardProps) {
  const getStatusConfig = () => {
    switch (status) {
      case 'running':
        return { icon: <Loader2 className="w-4 h-4 animate-spin" />, label: 'EXECUTING', bgColor: 'bg-yellow-500/10', borderColor: 'border-yellow-500/50', textColor: 'text-yellow-600' }
      case 'completed':
        return { icon: <CheckCircle2 className="w-4 h-4" />, label: 'COMPLETED', bgColor: 'bg-green-500/10', borderColor: 'border-green-500/50', textColor: 'text-green-600' }
      case 'failed':
        return { icon: <XCircle className="w-4 h-4" />, label: 'FAILED', bgColor: 'bg-red-500/10', borderColor: 'border-red-500/50', textColor: 'text-red-600' }
      default:
        return { icon: <Clock className="w-4 h-4" />, label: 'PENDING', bgColor: 'bg-gray-500/10', borderColor: 'border-gray-500/30', textColor: 'text-gray-500' }
    }
  }

  const statusConfig = getStatusConfig()
  const formattedDuration = durationMs ? (durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(1)}s`) : null

  return (
    <div
      onClick={onClick}
      className={cn(
        'relative border-2 p-3 cursor-pointer transition-all duration-200 hover:shadow-md',
        statusConfig.borderColor,
        statusConfig.bgColor,
        isSelected && 'ring-2 ring-primary ring-offset-1'
      )}
    >
      <div className="absolute -top-2 -left-2 w-5 h-5 bg-card border-2 border-border flex items-center justify-center">
        <span className="text-[10px] font-mono font-bold">{sortOrder + 1}</span>
      </div>

      <div className="flex items-center justify-between mb-2 pl-2">
        <span className="text-xs font-mono font-bold uppercase tracking-wider">{expertType}</span>
        <div className={cn('flex items-center gap-1 text-[10px] font-mono', statusConfig.textColor)}>
          {statusConfig.icon}
          <span>{statusConfig.label}</span>
        </div>
      </div>

      <p className="text-xs text-muted-foreground line-clamp-2 mb-2 pl-2">{description}</p>

      <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground pl-2">
        <span>{formattedDuration || '--'}</span>
        {artifactCount > 0 && (
          <div className="flex items-center gap-1">
            <FileText className="w-3 h-3" />
            <span>{artifactCount}</span>
          </div>
        )}
      </div>
    </div>
  )
}

interface ExpertTaskListProps {
  className?: string
}

export function ExpertTaskList({ className }: ExpertTaskListProps) {
  // 使用订阅模式，确保状态更新时组件重渲染
  const session = useTaskStore((state) => state.session)
  const tasks = useTaskStore((state) => Array.from(state.tasks.values()).sort((a, b) => a.sort_order - b.sort_order))
  const selectedTaskId = useTaskStore((state) => state.selectedTaskId)
  const selectTask = useTaskStore((state) => state.selectTask)

  // 计算进度
  const total = tasks.length
  const completed = tasks.filter((t) => t.status === 'completed' || t.status === 'failed').length
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0

  // 如果没有任务会话，显示加载状态
  if (!session) {
    return (
      <div className={cn('flex flex-col h-full bg-card items-center justify-center p-4', className)}>
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-2" />
        <p className="text-xs font-mono text-muted-foreground">初始化任务...</p>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col h-full bg-card', className)}>
      {/* 头部 */}
      <div className="border-b-2 border-border p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold font-mono uppercase tracking-wider">TASK PLAN</h3>
          <span className="text-[10px] font-mono text-muted-foreground">{session.executionMode.toUpperCase()}</span>
        </div>

        <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{session.summary}</p>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] font-mono">
            <span className="text-muted-foreground">PROGRESS</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 bg-muted border border-border overflow-hidden">
            <div className="h-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>

      {/* 任务列表 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            expertType={task.expert_type}
            description={task.description}
            status={task.status}
            sortOrder={task.sort_order}
            durationMs={task.durationMs}
            artifactCount={task.artifacts.length}
            isSelected={selectedTaskId === task.id}
            onClick={() => selectTask(task.id)}
          />
        ))}
      </div>

      {/* 底部统计 */}
      <div className="border-t-2 border-border p-3">
        <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
          <span>TOTAL: {tasks.length}</span>
          <div className="flex items-center gap-3">
            <span className="text-yellow-600">RUN: {tasks.filter((t) => t.status === 'running').length}</span>
            <span className="text-green-600">OK: {tasks.filter((t) => t.status === 'completed').length}</span>
            <span className="text-red-600">ERR: {tasks.filter((t) => t.status === 'failed').length}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
