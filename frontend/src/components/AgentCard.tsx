import { memo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Agent } from '@/data/agents'
import { cn } from '@/lib/utils'

interface AgentCardProps {
  agent: Agent
  isSelected: boolean
  onClick: () => void
}

// 图标背景色映射（使用 vibe 配色）
const iconBgMap: Record<string, string> = {
  'from-blue-500 to-purple-500': 'bg-blue-50 dark:bg-blue-900/30',
  'from-green-500 to-emerald-500': 'bg-green-50 dark:bg-green-900/30',
  'from-pink-500 to-rose-500': 'bg-pink-50 dark:bg-pink-900/30',
  'from-orange-500 to-red-500': 'bg-orange-50 dark:bg-orange-900/30',
  'from-yellow-500 to-orange-500': 'bg-yellow-50 dark:bg-yellow-900/30',
  'from-cyan-500 to-blue-500': 'bg-cyan-50 dark:bg-cyan-900/30',
  'from-indigo-500 to-purple-500': 'bg-indigo-50 dark:bg-indigo-900/30',
  'from-violet-500 to-fuchsia-500': 'bg-violet-50 dark:bg-violet-900/30',
}

// 图标文字色映射（使用 vibe 配色）
const iconTextMap: Record<string, string> = {
  'from-blue-500 to-purple-500': 'text-blue-600 dark:text-blue-400',
  'from-green-500 to-emerald-500': 'text-green-600 dark:text-green-400',
  'from-pink-500 to-rose-500': 'text-pink-600 dark:text-pink-400',
  'from-orange-500 to-red-500': 'text-orange-600 dark:text-orange-400',
  'from-yellow-500 to-orange-500': 'text-yellow-600 dark:text-yellow-400',
  'from-cyan-500 to-blue-500': 'text-cyan-600 dark:text-cyan-400',
  'from-indigo-500 to-purple-500': 'text-indigo-600 dark:text-indigo-400',
  'from-violet-500 to-fuchsia-500': 'text-violet-600 dark:text-violet-400',
}

function AgentCard({ agent, isSelected, onClick }: AgentCardProps) {
  const iconBg = iconBgMap[agent.color] || 'bg-gray-50'
  const iconText = iconTextMap[agent.color] || 'text-gray-600'

  return (
    <Card
      onClick={onClick}
      className={cn(
        'cursor-pointer transition-all duration-300 hover:scale-105 border',
        'bg-card/80 backdrop-blur-sm',
        isSelected
          ? 'border-white/60 dark:border-gray-600/60 shadow-[0_20px_50px_rgba(0,0,0,0.08)] ring-1 ring-vibe-accent/20 dark:ring-vibe-accent/30'
          : 'border-white/40 dark:border-gray-700/40 shadow-sm hover:border-white/50 dark:hover:border-gray-600/50'
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              'w-12 h-12 rounded-xl flex items-center justify-center shadow-sm',
              iconBg
            )}
          >
            <div className={iconText}>
              {agent.icon}
            </div>
          </div>
          <div className="flex-1">
            <CardTitle className="text-lg text-gray-800 dark:text-gray-100 transition-colors duration-300">
              {agent.name}
            </CardTitle>
            <span className="text-xs px-2 py-0.5 rounded-full bg-secondary/40 text-muted-foreground transition-colors duration-300">
              {agent.category}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground transition-colors duration-300">
          {agent.description}
        </p>
      </CardContent>
    </Card>
  )
}

export default memo(AgentCard)
