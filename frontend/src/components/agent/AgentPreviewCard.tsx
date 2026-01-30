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
        'border-2 border-[var(--border-color)] bg-[var(--bg-card)]',
        'shadow-[var(--shadow-color)_4px_4px_0_0]',
        'transition-all duration-200',
        'hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[var(--shadow-color)_6px_6px_0_0]',
        'active:translate-x-[0px] active:translate-y-[0px] active:shadow-[var(--shadow-color)_2px_2px_0_0]'
      )}
    >
      {/* 左侧黄色竖条 */}
      <div
        className={cn(
          'absolute left-0 top-0 bottom-0 w-1 bg-[var(--accent-hover)]',
          'transition-all duration-200',
          'opacity-0 group-hover:opacity-100'
        )}
      />

      <div className="p-4 pl-5">
        <div className="flex items-start gap-3">
          {/* 图标容器 - Bauhaus 风格 */}
          <div
            className={cn(
              'w-10 h-10 border-2 border-[var(--border-color)] flex items-center justify-center flex-shrink-0',
              'bg-[var(--bg-page)]',
              'transition-all duration-200',
              'group-hover:bg-[var(--accent-hover)] group-hover:border-[var(--accent-hover)]'
            )}
          >
            <Bot className="w-5 h-5 text-[var(--text-primary)] group-hover:text-black transition-colors" />
          </div>

          {/* 标题与标签 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <h3 className="font-mono font-bold text-sm text-[var(--text-primary)] truncate leading-tight">
                {name || '未命名智能体'}
              </h3>
              <span className="flex-shrink-0 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase border border-[var(--border-color)] bg-[var(--bg-page)] text-[var(--text-secondary)]">
                {category || '综合'}
              </span>
            </div>
            <p className="font-mono text-[10px] text-[var(--text-secondary)] leading-relaxed line-clamp-2">
              {description || '点击编辑智能体描述...'}
            </p>
          </div>
        </div>
      </div>

      {/* 右下角装饰三角 */}
      <div className="absolute bottom-0 right-0 w-0 h-0 border-b-[16px] border-r-[16px] border-b-[var(--accent-hover)] border-r-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  )
}
