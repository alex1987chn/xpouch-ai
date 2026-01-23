import { memo } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import type { Agent } from '@/types'
import { cn } from '@/lib/utils'
import { Trash2 } from 'lucide-react'

interface AgentCardProps {
  agent: Agent
  isSelected: boolean
  onClick: () => void
  onDelete?: () => void
  index?: number
  showDeleteButton?: boolean
}

function AgentCard({ agent, isSelected, onClick, onDelete, index: _index, showDeleteButton = false }: AgentCardProps) {
  const isDefaultAgent = agent.isDefault === true

  return (
    <div
      onClick={onClick}
      className={cn(
        'group relative cursor-pointer overflow-hidden',
        // 默认助手特殊样式
        isDefaultAgent
          ? 'bg-gradient-to-br from-violet-50/80 to-fuchsia-50/80 dark:from-violet-950/50 dark:to-fuchsia-950/50 border-violet-300 dark:border-violet-700 shadow-[0_8px_30px_rgb(139,92,246,0.08)]'
          : 'bg-white dark:bg-slate-900/50 border-slate-200/50 dark:border-slate-700/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)]',
        'rounded-2xl border',
        'transition-all duration-300 ease-out',
        // 悬停效果：上移 4px + 深色投影
        'hover:-translate-y-1 hover:shadow-xl',
        // 选中状态：紫色光环 + 边框变色
        isSelected && !isDefaultAgent && 'ring-2 ring-violet-500/20 border-violet-300 dark:border-violet-600',
        // 默认助手的选中状态
        isSelected && isDefaultAgent && 'ring-2 ring-violet-500/40 border-violet-500 dark:border-violet-400'
      )}
    >
      {/* 左侧渐变竖条 - 4px 宽度，完全覆盖边缘 */}
      <div
        className={cn(
          'absolute left-0 top-0 bottom-0 w-[4px] bg-gradient-to-b from-blue-400 to-violet-500',
          'transition-all duration-300 ease-out',
          // 默认隐藏，悬停/选中时显示
          (isSelected || isDefaultAgent) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
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
                // 默认助手的特殊样式
                isDefaultAgent
                  ? 'bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-lg shadow-violet-500/30'
                  : 'bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/30 dark:to-purple-900/30',
                // Hover 时变为 violet-500 渐变（非默认助手）
                !isDefaultAgent && 'group-hover:bg-gradient-to-br group-hover:from-violet-500 group-hover:to-fuchsia-500 group-hover:scale-110',
                // 默认助手不放大
                isDefaultAgent && 'scale-110'
              )}
            >
              <div className={cn(
                'transition-colors duration-300',
                // 默认助手的图标颜色
                isDefaultAgent
                  ? 'text-white'
                  : 'text-blue-600 dark:text-blue-400',
                // Hover 时变为白色（非默认助手）
                !isDefaultAgent && 'group-hover:text-white'
              )}>
                {agent.icon}
              </div>
            </div>

            {/* 标题与标签 */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-slate-800 dark:text-slate-100 truncate text-sm leading-tight">
                    {agent.name}
                  </h3>
                  {/* 默认助手标记 */}
                  {isDefaultAgent && (
                    <span className="flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-sm">
                      默认
                    </span>
                  )}
                </div>
                {!isDefaultAgent && (
                  <span className="flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                    {agent.category}
                  </span>
                )}
              </div>
            </div>

            {showDeleteButton && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete?.()
                }}
                className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors text-red-600 dark:text-red-400"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
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
