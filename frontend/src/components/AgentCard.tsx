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
        'group cursor-pointer transition-all duration-300 border-2',
        'bg-white/40 dark:bg-slate-900/80 backdrop-blur-sm',
        'shadow-[0_8px_30px_rgb(0,0,0,0.04)]',
        'hover:-translate-y-1 hover:shadow-xl hover:bg-white/60 dark:hover:bg-slate-800/80',
        isSelected
          ? 'border-purple-300 dark:border-purple-500 ring-2 ring-purple-100 dark:ring-purple-500/20'
          : 'border-transparent hover:border-purple-200 dark:hover:border-purple-500/60'
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              'w-12 h-12 rounded-xl flex items-center justify-center shadow-sm',
              'backdrop-blur-sm bg-white/40 dark:bg-slate-800/60',
              'transition-colors group-hover:bg-white/60 dark:group-hover:bg-slate-700/60',
              iconBg.replace('dark:bg-', 'bg-').replace('/30', '/60')
            )}
          >
            <div className={cn(iconText, 'transition-colors group-hover:scale-110')}>
              {agent.icon}
            </div>
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg text-gray-800 dark:text-gray-100 transition-colors duration-300">
                {agent.name}
              </CardTitle>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400 bg-gray-100/60 dark:bg-slate-700/60">
                {agent.category}
              </span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-gray-600 dark:text-slate-400 leading-relaxed transition-colors duration-300">
          {agent.description}
        </p>
      </CardContent>
    </Card>
  )
}

export default memo(AgentCard)
