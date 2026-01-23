import { memo } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import type { Agent } from '@/types'
import { cn } from '@/lib/utils'
import { Trash2, Plus } from 'lucide-react'

interface AgentCardProps {
  agent: Agent
  isSelected: boolean
  onClick: () => void
  onDelete?: () => void
  onCreateAgent?: () => void
  index?: number
  showDeleteButton?: boolean
}

function AgentCard({ agent, isSelected, onClick, onDelete, onCreateAgent, index: _index, showDeleteButton = false }: AgentCardProps) {
  const isDefaultAgent = agent.isDefault === true
  const isCreateCard = agent.isCreateCard === true

  // 如果是创建智能体卡片，使用简洁的居中加号样式
  if (isCreateCard) {
    return (
      <div
        onClick={onCreateAgent}
        className="group relative cursor-pointer overflow-hidden bg-white dark:bg-slate-900/50 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl transition-all duration-300 ease-out hover:-translate-y-1 hover:border-violet-400 dark:hover:border-violet-600 hover:shadow-lg flex items-center justify-center p-8"
      >
        {/* 居中的大加号 */}
        <div className="flex flex-col items-center gap-3">
          <div
            className={cn(
              'w-16 h-16 rounded-2xl flex items-center justify-center',
              'bg-gradient-to-br from-violet-100 to-fuchsia-100 dark:from-violet-900/30 dark:to-fuchsia-900/30',
              'transition-all duration-300 ease-out',
              'group-hover:scale-110 group-hover:bg-gradient-to-br group-hover:from-violet-500 group-hover:to-fuchsia-500'
            )}
          >
            <Plus className={cn('w-8 h-8 text-violet-500 dark:text-violet-400 transition-colors', 'group-hover:text-white')} />
          </div>
          <span className="text-sm font-medium text-slate-600 dark:text-slate-400 group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">
            创建智能体
          </span>
        </div>
      </div>
    )
  }

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
        'hover:-translate-y-1 hover:shadow-xl'
        // 移除所有选中高亮状态（ring边框）
      )}
    >
      {/* 左侧渐变竖条 - 4px 宽度，完全覆盖边缘 */}
      <div
        className={cn(
          'absolute left-0 top-0 bottom-0 w-[4px] bg-gradient-to-b from-blue-400 to-violet-500',
          'transition-all duration-300 ease-out',
          // 默认隐藏，悬停时显示（移除选中状态）
          isDefaultAgent ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        )}
      />

      {/* 删除按钮 - 右上角，hover时显示 */}
      {showDeleteButton && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete?.()
          }}
          className={cn(
            'absolute top-3 right-3 z-10',
            'p-2 rounded-lg transition-all duration-200',
            'bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm',
            'text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300',
            'opacity-0 group-hover:opacity-100 hover:scale-110 hover:bg-red-50 dark:hover:bg-red-900/20',
            'shadow-sm hover:shadow-md'
          )}
          title="删除"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}

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
                !isDefaultAgent && 'group-hover:bg-gradient-to-br group-hover:from-violet-500 group-hover:to-fuchsia-500 group-hover:scale-110'
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
