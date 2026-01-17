import { memo } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import type { Agent } from '@/types'
import { cn } from '@/lib/utils'

interface AgentCardProps {
  agent: Agent
  isSelected: boolean
  onClick: () => void
  index?: number
}

function AgentCard({ agent, isSelected, onClick, index: _index }: AgentCardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'group relative cursor-pointer overflow-hidden',
        'bg-white dark:bg-slate-900/50',
        'rounded-2xl border border-slate-200/50 dark:border-slate-700/50',
        'shadow-[0_8px_30px_rgb(0,0,0,0.04)]',
        'transition-all duration-300 ease-out',
        // 悬停效果：上移 4px + 深色投影
        'hover:-translate-y-1 hover:shadow-xl',
        // 选中状态：紫色光环 + 边框变色
        isSelected && 'ring-2 ring-violet-500/20 border-violet-300 dark:border-violet-600'
      )}
    >
      {/* 左侧渐变竖条 - 4px 宽度，完全覆盖边缘 */}
      <div
        className={cn(
          'absolute left-0 top-0 bottom-0 w-[4px] bg-gradient-to-b from-blue-400 to-violet-500',
          'transition-all duration-300 ease-out',
          // 默认隐藏，悬停/选中时显示
          (isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')
        )}
      />

      <Card className="bg-transparent border-0 shadow-none h-full">
        <CardHeader className="pb-3 pl-5">
          <div className="flex items-start gap-3">
            {/* 图标容器 - Hover 时变为 violet 渐变 */}
            <div
              className={cn(
                'w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0',
                'transition-all duration-300 ease-out',
                // 默认渐变背景
                'bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/30 dark:to-purple-900/30',
                // Hover 时变为 violet-500 渐变
                'group-hover:bg-gradient-to-br group-hover:from-violet-500 group-hover:to-fuchsia-500',
                'group-hover:scale-110'
              )}
            >
              <div className={cn(
                'transition-colors duration-300',
                // 默认文字颜色
                'text-blue-600 dark:text-blue-400',
                // Hover 时变为白色
                'group-hover:text-white'
              )}>
                {agent.icon}
              </div>
            </div>

            {/* 标题与标签 */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-1">
                <h3 className="font-bold text-slate-800 dark:text-slate-100 truncate text-sm leading-tight">
                  {agent.name}
                </h3>
                <span className="flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                  {agent.category}
                </span>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pl-5 pt-0">
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2">
            {agent.description}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

export default memo(AgentCard)
