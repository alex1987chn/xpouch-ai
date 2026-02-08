/**
 * 工业数据总线风格的专家轨道
 * Server-Driven UI：从 taskStore 读取任务状态
 */

import { cn } from '@/lib/utils'
import { useTaskStore } from '@/store/taskStore'
import type { Task } from '@/store/taskStore'

// 专家标签映射
const expertLabels: Record<string, string> = {
  search: 'SRCH',
  coder: 'CODE',
  researcher: 'RSCH',
  analyzer: 'DATA',
  writer: 'WRT',
  planner: 'PLAN',
  designer: 'DSGN',
  architect: 'ARC',
  default: 'AGENT',
}

// 状态图标组件
const StatusIcon = ({ status }: { status: string }) => {
  switch (status) {
    case 'running':
      return (
        <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
      )
    case 'completed':
      return (
        <div className="w-2 h-2 bg-green-500 rounded-full" />
      )
    case 'failed':
      return (
        <div className="w-2 h-2 bg-red-500 rounded-full" />
      )
    default:
      return (
        <div className="w-2 h-2 bg-border rounded-full" />
      )
  }
}

// 单个专家节点组件
interface ExpertNodeProps {
  task: Task
  isSelected: boolean
  isRunning: boolean
  index: number
  onClick: () => void
}

function ExpertNode({ task, isSelected, isRunning, index, onClick }: ExpertNodeProps) {
  const label = expertLabels[task.expert_type] || expertLabels.default
  
  return (
    <div className="group relative flex items-center gap-3 w-full justify-center">
      {/* 连接线 */}
      <div className={cn(
        "w-3 h-0.5 -z-10 transition-colors duration-300",
        isRunning ? "bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.3)]" : "bg-border/40"
      )} />
      
      {/* 节点 */}
      <div 
        onClick={onClick}
        className={cn(
          "relative w-10 h-10 border-2 bg-card flex items-center justify-center cursor-pointer transition-all duration-300 hover:scale-105",
          // Pending 状态
          task.status === 'pending' && "opacity-50 grayscale border-dashed",
          // Running 状态
          task.status === 'running' && cn(
            "opacity-100 border-yellow-400 scale-105",
            "shadow-[0_0_10px_rgba(250,204,21,0.5)]",
            "animate-pulse-glow"
          ),
          // Completed 状态
          task.status === 'completed' && "opacity-80 border-2 border-primary grayscale-0",
          // Failed 状态
          task.status === 'failed' && "opacity-80 border-2 border-red-500",
          // 选中状态
          isSelected && "shadow-hard scale-110 bg-accent"
        )}
      >
        {/* 序号 */}
        <div className="absolute -top-1 -left-1 w-4 h-4 bg-primary text-primary-foreground text-[9px] font-mono flex items-center justify-center rounded-sm border border-border">
          {String(index + 1).padStart(2, '0')}
        </div>
        
        {/* 专家标签 */}
        <span className={cn(
          "font-black text-xs",
          isSelected ? "text-primary-foreground" : "text-primary"
        )}>{label}</span>
        
        {/* 状态指示灯 */}
        {task.status === 'running' && (
          <div className="absolute -bottom-0.5 -right-0.5">
            <div className="w-3 h-3 bg-yellow-400 rounded-full relative">
              <div className="absolute inset-0 rounded-full animate-ping bg-yellow-400" />
            </div>
          </div>
        )}
      </div>
      
      {/* Tooltip - 显示任务描述 */}
      <div className={cn(
        "absolute left-full ml-2 top-1/2 -translate-y-1/2 bg-popover text-popover-foreground text-[10px] px-2 py-1 border border-border rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 max-w-[200px] truncate"
      )}>
        {task.description || task.expert_type}
      </div>
      
      {/* 🔥 运行中任务的特殊高亮效果 */}
      {isRunning && (
        <>
          {/* 呼吸灯边框 */}
          <div className="absolute inset-0 border-2 border-yellow-400 rounded animate-ping opacity-20" />
          {/* 状态提示 */}
          <div className="absolute -right-1 -top-1 w-3 h-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow-400 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-yellow-400" />
          </div>
        </>
      )}
    </div>
  )
}

// 主组件
interface BusRailProps {
  tasks: Task[]
  selectedTaskId: string | null
  onTaskClick: (id: string) => void
}

export default function BusRail({ tasks, selectedTaskId, onTaskClick }: BusRailProps) {
  const runningTaskIds = useTaskStore((state) => state.runningTaskIds)
  const isSystemBusy = runningTaskIds.size > 0

  return (
    <div className="w-20 py-4 relative shrink-0 overflow-visible flex flex-col items-center">
      {/* 背景总线 - The Spine - 居中 */}
      <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-0.5 bg-border/40 z-0">
        {/* 刻度装饰 */}
        <div className="absolute top-0 w-2 h-1 bg-border/60 left-1/2 -translate-x-1/2" />
        <div className="absolute bottom-0 w-2 h-1 bg-border/60 left-1/2 -translate-x-1/2" />
        
        {/* 光流动画 - 系统忙碌时显示 */}
        {isSystemBusy && (
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-yellow-400/30 to-transparent w-full animate-bus-flow">
            {/* 光晕效果 */}
            <div className="absolute inset-0 bg-yellow-400/10 blur-sm" />
          </div>
        )}
      </div>
      
      {/* 节点列表 */}
      <div className="flex flex-col items-center gap-4 relative z-10">
        {tasks.map((task, idx) => (
          <ExpertNode
            key={task.id}
            task={task}
            isSelected={selectedTaskId === task.id}
            isRunning={runningTaskIds.has(task.id)}
            index={idx}
            onClick={() => onTaskClick(task.id)}
          />
        ))}
      </div>
    </div>
  )
}
