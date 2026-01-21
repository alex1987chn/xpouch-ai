import { memo } from 'react'
import { AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

export interface FloatingExpertBarProps {
  activeExpertId: string | null
}

// 专家配置
const EXPERT_CONFIG: Record<string, { name: string; icon: string }> = {
  search: { name: '搜索', icon: '🔍' },
  coder: { name: '编程', icon: '💻' },
  researcher: { name: '研究', icon: '📚' },
  analyzer: { name: '分析', icon: '📊' },
  writer: { name: '写作', icon: '✍️' },
  planner: { name: '规划', icon: '📋' }
}

function FloatingExpertBar({ activeExpertId }: FloatingExpertBarProps) {
  return (
    <div className="absolute top-0 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 px-4 h-8
                 bg-slate-900/60 backdrop-blur-md rounded-full border border-slate-700/50
                 shadow-lg">
      {(Object.keys(EXPERT_CONFIG) as string[]).map((expertId) => {
        const isActive = activeExpertId === expertId
        const config = EXPERT_CONFIG[expertId]
        if (!config) return null

        return (
          <div
            key={expertId}
            className={cn(
              'relative w-4 h-4 flex items-center justify-center',
              'transition-opacity duration-200',
              !isActive && 'opacity-40'
            )}
            title={config.name}
          >
            {/* 活跃状态指示 */}
            {isActive && (
              <div className="absolute inset-0 bg-blue-400/20 rounded-full animate-pulse" />
            )}
            {/* Emoji */}
            <span className="text-sm leading-none select-none z-10">
              {config.icon}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default memo(FloatingExpertBar)
