import { Bot } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AgentPreviewCardProps {
  name: string
  description: string
  category: string
}

export default function AgentPreviewCard({ name, description, category }: AgentPreviewCardProps) {
  return (
    <div
      className={cn(
        'group relative cursor-pointer overflow-hidden',
        'bg-white dark:bg-slate-900/50',
        'rounded-2xl border border-slate-200/50 dark:border-slate-700/50',
        'shadow-[0_8px_30px_rgb(0,0,0,0.04)]',
        'transition-all duration-300 ease-out',
        'hover:-translate-y-1 hover:shadow-xl'
      )}
    >
      {/* 左侧渐变竖条 - 悬停时显示 */}
      <div
        className={cn(
          'absolute left-0 top-0 bottom-0 w-[4px] bg-gradient-to-b from-blue-400 to-violet-500',
          'transition-all duration-300 ease-out',
          'opacity-0 group-hover:opacity-100'
        )}
      />

      <div className="p-5 pl-5">
        <div className="flex items-start gap-3">
          {/* 图标容器 */}
          <div
            className={cn(
              'w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0',
              'bg-gradient-to-br from-violet-500 to-fuchsia-500',
              'transition-all duration-300 ease-out',
              'group-hover:scale-110'
            )}
          >
            <Bot className="w-5 h-5 text-white" />
          </div>

          {/* 标题与标签 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <h3 className="font-bold text-slate-800 dark:text-slate-100 truncate text-sm leading-tight">
                {name || '未命名智能体'}
              </h3>
              <span className="flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                {category || '综合'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2">
              {description || '点击编辑智能体描述...'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
