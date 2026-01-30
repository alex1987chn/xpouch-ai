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

// 现代卡片设计系统
const STYLES = {
  default: {
    // 卡片基础样式
    bg: 'bg-white dark:bg-slate-900/80',
    border: 'border border-slate-200/80 dark:border-slate-700/50',
    shadow: 'shadow-[0_4px_20px_rgb(0,0,0,0.04)] dark:shadow-[0_4px_20px_rgb(0,0,0,0.15)]',
    // 悬停效果
    hoverBg: 'hover:bg-white dark:hover:bg-slate-900',
    hoverBorder: 'hover:border-violet-300/50 dark:hover:border-violet-500/50',
    hoverShadow: 'hover:shadow-[0_12px_40px_rgb(0,0,0,0.08)] dark:hover:shadow-[0_12px_40px_rgb(0,0,0,0.25)]',
    hoverTransform: 'hover:-translate-y-0.5',
    // 图标容器
    iconBg: 'bg-gradient-to-br from-slate-100 to-slate-50 dark:from-slate-800 dark:to-slate-900/50',
    iconColor: 'text-slate-600 dark:text-slate-300',
    iconHoverColor: 'text-violet-600 dark:text-violet-400',
  },
  defaultAgent: {
    // 默认助手特殊样式
    bg: 'bg-white dark:bg-slate-900/90',
    border: 'border border-violet-200/50 dark:border-violet-800/30',
    shadow: 'shadow-[0_4px_20px_rgb(120,119,198,0.08)] dark:shadow-[0_4px_20px_rgb(120,119,198,0.15)]',
    // 悬停效果
    hoverBg: 'hover:bg-white dark:hover:bg-slate-900',
    hoverBorder: 'hover:border-violet-300/70 dark:hover:border-violet-600/50',
    hoverShadow: 'hover:shadow-[0_12px_40px_rgb(120,119,198,0.12)] dark:hover:shadow-[0_12px_40px_rgb(120,119,198,0.25)]',
    hoverTransform: 'hover:-translate-y-0.5',
    // 图标容器
    iconBg: 'bg-gradient-to-br from-violet-100 to-purple-50 dark:from-violet-900/30 dark:to-purple-900/20',
    iconColor: 'text-violet-600 dark:text-violet-400',
    iconHoverColor: 'text-violet-700 dark:text-violet-300',
  },
} as const

function AgentCard({ agent, isSelected, onClick, onDelete, onCreateAgent }: AgentCardProps) {
  const isDefaultAgent = agent.isDefault === true
  const isCreateCard = agent.isCreateCard === true
  const style = isDefaultAgent ? STYLES.defaultAgent : STYLES.default

  // 创建智能体卡片
  if (isCreateCard) {
    return (
      <div
        onClick={onCreateAgent}
        className={cn(
          'group cursor-pointer relative overflow-hidden rounded-xl',
          'bg-gradient-to-br from-slate-50/80 to-slate-100/50 dark:from-slate-900/40 dark:to-slate-800/30',
          'border border-dashed border-slate-300/70 dark:border-slate-700/50',
          'transition-all duration-300 ease-out',
          'hover:border-violet-400/70 dark:hover:border-violet-500/50',
          'hover:shadow-xl hover:shadow-violet-500/10',
          'hover:-translate-y-0.5',
          'flex flex-col items-center justify-center p-4 sm:p-5 min-h-[80px] sm:min-h-[100px]'
        )}
      >
        <div className="flex flex-col items-center gap-1.5 sm:gap-2">
          <div className={cn(
            'w-8 h-8 sm:w-10 sm:h-10 rounded-lg',
            'bg-gradient-to-br from-white to-slate-50 dark:from-slate-800 dark:to-slate-900/80',
            'shadow-sm border border-slate-200/50 dark:border-slate-700/30',
            'flex items-center justify-center',
            'transition-all duration-300 ease-out',
            'group-hover:scale-110 group-hover:shadow-lg group-hover:border-violet-300/50 dark:group-hover:border-violet-500/30'
          )}>
            <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-500 group-hover:text-violet-600 dark:text-slate-400 dark:group-hover:text-violet-400 transition-colors duration-300" />
          </div>
          <span className="text-[11px] sm:text-sm font-medium text-slate-600 dark:text-slate-300 group-hover:text-violet-700 dark:group-hover:text-violet-400 transition-colors duration-300">
            创建智能体
          </span>
        </div>
      </div>
    )
  }

  // 普通智能体卡片 - 现代设计
  return (
    <div
      onClick={onClick}
      className={cn(
        'group cursor-pointer relative rounded-xl overflow-hidden transition-all duration-300 ease-out',
        // 基础样式
        style.bg,
        style.border,
        style.shadow,
        style.hoverTransform,
        // 悬停效果
        style.hoverBg,
        style.hoverBorder,
        style.hoverShadow,
        // 选中状态特殊处理
        isSelected && 'ring-0'
      )}
    >
      {/* 选中时的渐变边框 */}
      {isSelected && (
        <div className="absolute inset-0 rounded-xl p-[1px] pointer-events-none">
          <div className="w-full h-full rounded-xl bg-gradient-to-r from-violet-500/80 via-fuchsia-500/80 to-pink-500/80 animate-pulse opacity-30" />
        </div>
      )}

      <Card className={cn(
        'relative z-10 bg-white/50 dark:bg-slate-900/30 border-0 shadow-inner rounded-xl h-full transition-all duration-300 backdrop-blur-sm'
      )}>
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-center justify-between gap-2 sm:gap-3">
            {/* 左侧：图标 + 信息 */}
            <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
              {/* 图标容器 */}
              <div className={cn(
                'relative flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-lg',
                style.iconBg,
                'flex items-center justify-center',
                'transition-all duration-300 ease-out',
                'group-hover:scale-105 group-hover:shadow-lg'
              )}>
                {/* 默认助手装饰点 */}
                {isDefaultAgent && (
                  <div className="absolute -top-1 -right-1 w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full flex items-center justify-center">
                    <div className="absolute inset-0 rounded-full bg-gradient-to-r from-violet-500 to-purple-500 animate-pulse opacity-20" />
                    <div className="relative w-1.5 h-1.5 sm:w-2 sm:h-2 bg-white rounded-full shadow-sm" />
                  </div>
                )}
                <span className={cn(
                  'transition-colors duration-300 ease-out',
                  style.iconColor,
                  'group-hover:' + style.iconHoverColor,
                  'text-base sm:text-lg'
                )}>
                  {agent.icon}
                </span>
              </div>

              {/* 文本信息 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5">
                  <h3 className={cn(
                    'font-semibold truncate transition-all duration-300 ease-out',
                    'text-slate-900 dark:text-slate-100',
                    'group-hover:text-violet-700 dark:group-hover:text-violet-300',
                    'text-[13px] sm:text-sm'
                  )}>
                    {agent.name}
                  </h3>
                  {isDefaultAgent && (
                    <span className={cn(
                      'flex-shrink-0 px-1.5 sm:px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-medium',
                      'bg-gradient-to-r from-violet-500 to-purple-500',
                      'text-white shadow-sm',
                      'animate-pulse opacity-60'
                    )}>
                      默认
                    </span>
                  )}
                </div>
                <p className="text-[10px] sm:text-xs text-slate-600/80 dark:text-slate-300/80 line-clamp-1 font-normal">
                  {agent.description}
                </p>
              </div>
            </div>

            {/* 右侧：分类标签 + 删除按钮 */}
            <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
              {!isDefaultAgent && (
                <span className={cn(
                  'px-1.5 sm:px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-medium',
                  'bg-gradient-to-r from-slate-100 to-slate-50 dark:from-slate-800 dark:to-slate-900/50',
                  'text-slate-600 dark:text-slate-300',
                  'border border-slate-200/50 dark:border-slate-700/30',
                  'shadow-sm'
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
                    'p-1 sm:p-1.5 rounded-md transition-all duration-300 ease-out',
                    'text-slate-400 hover:text-white dark:text-slate-500 dark:hover:text-white',
                    'opacity-0 group-hover:opacity-100',
                    'bg-gradient-to-r from-transparent via-transparent to-transparent',
                    'hover:bg-gradient-to-r from-red-500/10 to-red-600/20 dark:hover:bg-gradient-to-r from-red-900/30 to-red-800/40',
                    'hover:shadow-sm hover:shadow-red-500/30 dark:hover:shadow-red-500/20',
                    'border border-transparent hover:border-red-300/30 dark:hover:border-red-700/30'
                  )}
                  title="删除"
                >
                  <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
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
