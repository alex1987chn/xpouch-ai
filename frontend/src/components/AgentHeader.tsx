import { cn } from '@/lib/utils'
import { Bot } from 'lucide-react'

interface AgentHeaderProps {
  agentName: string
  agentCategory?: string
  className?: string
}

export function AgentHeader({ agentName, agentCategory = 'AI', className }: AgentHeaderProps) {
  return (
    <div className={cn(
      'sticky top-0 z-10 w-full px-6 py-2 bg-white/60 dark:bg-gray-900/60 backdrop-blur-md border-b border-gray-200/50 dark:border-gray-800/50 transition-colors duration-300 shrink-0',
      className
    )}>
      <div className="max-w-3xl mx-auto flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 scale-90" style={{ background: 'linear-gradient(to bottom right, #6366F1, #8B5CF6)' }}>
          <Bot className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-medium text-gray-800 dark:text-gray-100 truncate leading-tight">
            {agentName}
          </h1>
          {agentCategory && (
            <span className="text-[10px] text-gray-500 dark:text-gray-400">
              {agentCategory}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
