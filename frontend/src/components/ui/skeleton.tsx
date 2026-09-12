/**
/** 语义 token 骨架屏。
 *
 * 用语义 token（surface-elevated + content-muted 低透明度）而不是写死灰色，
 * 暗色主题自动适配；animate-pulse 全局受 prefers-reduced-motion 约束。
 * 与业务布局同构组合使用（见 ArtifactsPage / SkillTemplatePanel / HistoryPage）。
 */

import { cn } from '@/lib/utils'

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'animate-pulse bg-content-muted/15 border border-border-default/40 rounded-sm',
        className
      )}
    />
  )
}

/** 产物/模板卡片骨架：与 ArtifactsPage、SkillTemplatePanel 卡片同构 */
export function CardSkeleton() {
  return (
    <div className="border-theme-card border-border-default bg-surface-card p-4 flex flex-col gap-3 min-h-[160px]">
      <Skeleton className="h-4 w-14" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-5/6 flex-1" />
      <Skeleton className="h-2.5 w-20" />
    </div>
  )
}

/** 行列表骨架：与 HistoryPage 行同构 */
export function RowSkeleton() {
  return (
    <div className="flex items-center gap-3 border-theme-card border-border-default bg-surface-card px-4 py-3">
      <Skeleton className="w-2 h-2 shrink-0" />
      <Skeleton className="h-3.5 flex-1 max-w-[40%]" />
      <Skeleton className="h-3 w-32 hidden md:block" />
      <Skeleton className="h-3 w-16 ml-auto" />
    </div>
  )
}
