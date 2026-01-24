import { memo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
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
}

// 简洁的配色系统
const STYLES = {
  default: {
    bg: 'bg-white dark:bg-slate-900/50',
    border: 'border-slate-200 dark:border-slate-800',
    hoverBorder: 'hover:border-violet-300 dark:hover:border-violet-700',
    hoverBg: 'hover:bg-slate-50 dark:hover:bg-slate-800/50',
    shadow: 'shadow-sm',
    hoverShadow: 'hover:shadow-lg',
  },
} as const

function AgentCard({ agent, isSelected, onClick, onDelete, onCreateAgent }: AgentCardProps) {
  const isDefaultAgent = agent.isDefault === true
  const isCreateCard = agent.isCreateCard === true
  const style = STYLES.default

  // 创建智能体卡片
  if (isCreateCard) {
    return (
      <div
        onClick={onCreateAgent}
        className={cn(
          'group cursor-pointer relative overflow-hidden rounded-xl',
          'bg-slate-50 dark:bg-slate-900/50',
          'border border-dashed border-slate-300 dark:border-slate-700',
          'transition-all duration-200 ease-out',
          'hover:border-violet-400 dark:hover:border-violet-600',
          'hover:shadow-lg hover:shadow-violet-500/10',
          'flex flex-col items-center justify-center p-5 min-h-[100px]'
        )}
      >
        <div className="flex flex-col items-center gap-2">
          <div className={cn(
            'w-10 h-10 rounded-lg',
            'bg-white dark:bg-slate-800',
            'shadow-sm border border-slate-200 dark:border-slate-700',
            'flex items-center justify-center',
            'transition-all duration-200',
            'group-hover:scale-105 group-hover:shadow-md'
          )}>
            <Plus className="w-4 h-4 text-slate-400 group-hover:text-violet-500 transition-colors" />
          </div>
          <span className="text-sm font-medium text-slate-500 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-200 transition-colors">
            创建智能体
          </span>
        </div>
      </div>
    )
  }

  // 普通智能体卡片 - 参考推荐场景卡片设计
  return (
    <div
      onClick={onClick}
      className={cn(
        'group cursor-pointer relative rounded-xl overflow-hidden transition-all duration-200 ease-out',
        // 选中状态
        isSelected && 'ring-1 ring-transparent',
        // 未选中状态
        !isSelected && [
          style.bg,
          style.border,
          style.hoverBg,
          style.hoverBorder,
          style.shadow
        ].join(' ')
      )}
    >
      {/* 选中时的渐变边框 */}
      {isSelected && (
        <div className="absolute inset-0 rounded-xl p-[1px] pointer-events-none">
          <div className="w-full h-full rounded-xl bg-gradient-to-r from-violet-500 via-fuchsia-500 to-pink-500" />
        </div>
      )}

      <Card className={cn(
        'relative z-10 bg-transparent border-0 shadow-none rounded-xl h-full transition-all duration-200'
      )}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-3">
            {/* 左侧：图标 + 信息 */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {/* 图标容器 */}
              <div className={cn(
                'flex-shrink-0 w-10 h-10 rounded-lg',
                'bg-slate-100 dark:bg-slate-800',
                'flex items-center justify-center',
                'transition-all duration-200',
                'group-hover:shadow-md'
              )}>
                {/* 默认助手装饰点 */}
                {isDefaultAgent && (
                  <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center shadow-sm">
                    <div className="w-1.5 h-1.5 bg-white rounded-full" />
                  </div>
                )}
                <span className={cn(
                  'text-slate-600 dark:text-slate-300 transition-colors duration-200',
                  'group-hover:text-violet-600 dark:group-hover:text-violet-400',
                  'text-lg'
                )}>
                  {agent.icon}
                </span>
              </div>

              {/* 文本信息 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <h3 className={cn(
                    'font-medium truncate transition-colors duration-200',
                    'text-slate-900 dark:text-slate-100',
                    'group-hover:text-slate-700 dark:group-hover:text-white',
                    'text-sm'
                  )}>
                    {agent.name}
                  </h3>
                  {isDefaultAgent && (
                    <span className={cn(
                      'flex-shrink-0 px-2 py-0.5 rounded text-[10px] font-medium',
                      'bg-violet-100 dark:bg-violet-900/50',
                      'text-violet-600 dark:text-violet-300'
                    )}>
                      默认
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">
                  {agent.description}
                </p>
              </div>
            </div>

            {/* 右侧：分类标签 + 删除按钮 */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {!isDefaultAgent && (
                <span className={cn(
                  'px-2 py-0.5 rounded text-[10px] font-medium',
                  'bg-slate-100 dark:bg-slate-800',
                  'text-slate-500 dark:text-slate-400'
                )}>
                  {agent.category}
                </span>
              )}
              {/* 删除按钮 hover 时显示 */}
              {!isDefaultAgent && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete?.()
                  }}
                  className={cn(
                    'p-1.5 rounded-md transition-all duration-150',
                    'text-slate-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400',
                    'opacity-0 group-hover:opacity-100',
                    'hover:bg-red-50 dark:hover:bg-red-900/20'
                  )}
                  title="删除"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default memo(AgentCard)
