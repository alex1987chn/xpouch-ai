/**
 * 路由指示器
 * 显示当前活跃的专家路由路径
 */

import type { RoutingIndicatorProps } from '../types'

export default function RoutingIndicator({ expertType }: RoutingIndicatorProps) {
  return (
    <div className="flex items-center gap-2 mb-0 ml-4 pl-4 border-l-2 border-dashed border-border/40 h-6">
      <span className="font-mono text-[9px] bg-panel dark:bg-panel/80 px-1.5 py-0.5 text-primary/70 dark:text-primary/60">ROUTING</span>
      <span className="text-primary/50 dark:text-primary/40">→</span>
      <span className="font-mono text-[9px] font-bold border border-border px-1.5 py-0.5 bg-card text-primary dark:text-primary/95">
        {expertType.toUpperCase()}_AGENT
      </span>
    </div>
  )
}
