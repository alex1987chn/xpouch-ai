/**
 * StatsPage - 运行统计页面
 *
 * [权限规则]
 * - admin: 查看全局数据
 * - 普通用户: 查看自己的数据
 *
 * [布局]
 * - 顶部指标卡片
 * - 中部趋势图
 * - 底部运行列表
 */

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from '@/i18n'
import { CardSkeleton, Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/states'
import { ErrorState } from '@/components/ui/states'
import PageTitle from '@/components/layout/PageTitle'
import { cn } from '@/lib/utils'
import { useUserStore } from '@/store/userStore'
import { getRunStats } from '@/services/stats'
import type { RunStatsResponse, RunListItem } from '@/types/stats'
import { logger } from '@/utils/logger'
import { RunStatusBadge } from '@/components/ui/run-status-badge'

// 图标组件
import { BarChart3, CheckCircle, AlertTriangle, Clock, ExternalLink, Coins } from 'lucide-react'

/**
 * 指标卡片组件
 */
function MetricCard({
 title,
 value,
 subtitle,
 icon,
 color,
}: {
 title: string
 value: string | number
 subtitle?: string
 icon: React.ReactNode
 color: 'green' | 'red' | 'yellow' | 'blue'
}) {

 const tintClasses = {
  green: 'bg-accent-success/12 text-accent-success',
  red: 'bg-accent-destructive/12 text-accent-destructive',
  yellow: 'bg-accent-warning/12 text-accent-warning',
  blue: 'bg-accent-info/12 text-accent-info',
 }

 return (
  <div className="rounded-md border border-border-divider bg-surface-card p-4">
   <div className="flex items-center justify-between">
    <span className="text-[11.5px] font-medium text-content-muted">{title}</span>
    <span className={cn('flex h-7 w-7 items-center justify-center rounded-full', tintClasses[color])}>{icon}</span>
   </div>
   <div className="mt-1.5 font-display text-[19px] font-bold leading-tight text-content-primary">{value}</div>
   {subtitle && <div className="mt-1 text-[11.5px] text-content-muted">{subtitle}</div>}
  </div>
 )
}

/**
 * 趋势图组件（CSS 柱状图）
 */
function TrendChart({ trends }: { trends: RunStatsResponse['trends'] }) {
 const { t } = useTranslation()

 if (!trends.length) {
  return (
   <div className="rounded-md border border-border-dashed border-border-divider bg-surface-tint/30 p-8 text-center text-content-muted">
    {t('noData')}
   </div>
  )
 }

 const maxValue = Math.max(...trends.map((d) => d.total_count), 1)

 return (
  <div className="rounded-md border border-border-divider bg-surface-card p-4">
   <h3 className="mb-3.5 text-xs font-bold text-content-secondary">
    {t('trends')} (7{t('days')})
   </h3>
   <div className="flex items-end justify-between gap-2 h-32">
    {trends.map((day) => (
     <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
      <div className="w-full flex flex-col gap-0.5">
       {/* 成功 */}
       <div
        className="w-full rounded-t-[4px] bg-accent-success/75"
        style={{
         height: `${(day.success_count / maxValue) * 80}px`,
         minHeight: day.success_count > 0 ? '4px' : '0',
        }}
       />
       {/* 失败 */}
       <div
        className="w-full rounded-b-[4px] bg-accent-destructive/75"
        style={{
         height: `${(day.failed_count / maxValue) * 80}px`,
         minHeight: day.failed_count > 0 ? '4px' : '0',
        }}
       />
      </div>
      <span className="text-micro text-content-muted">
       {day.date.slice(5)}
      </span>
     </div>
    ))}
   </div>
   <div className="flex gap-4 mt-4 text-xs text-content-secondary">
    <div className="flex items-center gap-1">
     <div className="h-2.5 w-2.5 rounded-sm bg-accent-success/75" />
     <span>{t('success')}</span>
    </div>
    <div className="flex items-center gap-1">
     <div className="h-2.5 w-2.5 rounded-sm bg-accent-destructive/75" />
     <span>{t('failed')}</span>
    </div>
   </div>
  </div>
 )
}

/**
 * 运行列表表格
 */
function RunTable({
 runs,
 isAdmin,
 onRunClick,
}: {
 runs: RunListItem[]
 isAdmin: boolean
 onRunClick: (runId: string) => void
}) {
 const { t } = useTranslation()

 if (!runs.length) {
  return (
   <div className="rounded-md border border-border-dashed border-border-divider bg-surface-tint/30 p-8 text-center text-content-muted">
    {t('noRuns')}
   </div>
  )
 }

 return (
  <div className="space-y-2">
   {runs.map(run => (
    <button
     key={run.run_id}
     onClick={() => onRunClick(run.run_id)}
     className="stagger-item group flex w-full items-center gap-3 rounded-md border border-border-divider bg-surface-card px-4 py-3 text-left transition-all hover:border-border-hover hover:shadow-theme-card"
    >
     <span className="font-display text-[13px] font-bold text-content-primary">
      #{run.run_id.slice(0, 8)}
     </span>
     {isAdmin && (
      <span className="hidden max-w-[120px] shrink-0 truncate text-xs text-content-muted md:inline">
       {run.user_name || run.user_id?.slice(0, 8)}
      </span>
     )}
     <span className="shrink-0 rounded-full bg-surface-tint px-2 py-0.5 text-nano font-medium capitalize text-content-secondary">
      {run.mode}
     </span>
     <RunStatusBadge status={run.status} variant="simple" />
     <span className="ml-auto hidden shrink-0 font-display text-xs text-content-muted sm:inline">
      {run.duration_ms ? `${(run.duration_ms / 1000).toFixed(1)}s` : '-'}
     </span>
     <span className="hidden shrink-0 text-xs text-content-muted lg:inline">
      {new Date(run.created_at).toLocaleString()}
     </span>
     <ExternalLink className="h-3.5 w-3.5 shrink-0 text-content-muted transition-colors group-hover:text-content-primary" />
    </button>
   ))}
  </div>
 )
}

/**
 * 主页面组件
 */
export default function StatsPage() {
 const { t } = useTranslation()
 const navigate = useNavigate()
 const { user } = useUserStore()
 const isAdmin = user?.role === 'admin'

 const [offset, setOffset] = useState(0)
 const [days, setDays] = useState(7)
 const limit = 50

 // 获取统计数据
 const { data, isLoading, error, refetch } = useQuery({
  queryKey: ['run-stats', limit, offset, days],
  queryFn: () => getRunStats(limit, offset, days),
  refetchOnWindowFocus: false,
 })

 const handleRunClick = (runId: string) => {
  navigate(`/run/${runId}`)
 }

 const handlePrevPage = () => {
  setOffset(Math.max(0, offset - limit))
 }

 const handleNextPage = () => {
  if (data && offset + limit < data.total_runs_count) {
   setOffset(offset + limit)
  }
 }

 if (isLoading) {
  // 与下方内容页同构：标题行 + 卡片网格
  return (
   <div className="min-h-full bg-surface-page px-6 md:px-12 py-8">
    <div className="max-w-5xl mx-auto space-y-6">
     <Skeleton className="h-7 w-48" />
     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
      {Array.from({ length: 6 }, (_, i) => (
       <CardSkeleton key={i} />
      ))}
     </div>
    </div>
   </div>
  )
 }

 if (error) {
  logger.error('[StatsPage] 加载失败:', error)
  return (
   <div className="min-h-full bg-surface-page p-8">
    <div className="max-w-7xl mx-auto">
     <ErrorState message={error instanceof Error ? error.message : undefined} onRetry={() => refetch()} />
    </div>
   </div>
  )
 }

 return (
  <div className="min-h-full bg-surface-page px-6 md:px-12 py-8">
   <div className="max-w-5xl mx-auto space-y-6">
    {/* 页面标题（PageTitle 统一习语） */}
    <PageTitle
     title={isAdmin ? t('globalStats') : t('myStats')}
     right={isAdmin ? (
      <span className="rounded-full bg-accent-brand/15 px-2 py-0.5 text-micro font-bold text-content-primary">
       Admin
      </span>
     ) : undefined}
    />

    {/* 新用户空状态：引导跑第一个任务 */}
    {data?.metrics && data.metrics.total_runs === 0 && (
     <div>
      <EmptyState
       title={t('noRuns')}
       description={t('noRunsHint')}
       action={{ label: t('navDashboard'), onClick: () => navigate('/') }}
      />
     </div>
    )}

    {/* 指标卡片 */}
    {data?.metrics && data.metrics.total_runs > 0 && (
     <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <MetricCard
       title={t('totalRuns')}
       value={data.metrics.total_runs}
       icon={<BarChart3 className="w-4 h-4" />}
       color="blue"
      />
      <MetricCard
       title={t('successRate')}
       value={`${data.metrics.success_rate}%`}
       subtitle={`${data.metrics.success_count}/${data.metrics.total_runs}`}
       icon={<CheckCircle className="w-4 h-4" />}
       color="green"
      />
      <MetricCard
       title={t('hitlCount')}
       value={data.metrics.hitl_count}
       icon={<AlertTriangle className="w-4 h-4" />}
       color="yellow"
      />
      <MetricCard
       title={t('todayTokens')}
       value={(data.today_tokens ?? 0).toLocaleString()}
       subtitle={
        data.daily_token_quota
         ? `${t('quotaRemaining')} ${Math.max(0, data.daily_token_quota - data.today_tokens).toLocaleString()}`
         : t('quotaUnlimited')
       }
       icon={<Coins className="w-4 h-4" />}
       color={data.daily_token_quota && data.today_tokens >= data.daily_token_quota ? 'red' : 'blue'}
      />
      <MetricCard
       title={t('avgDuration')}
       value={
        data.metrics.avg_duration_ms > 0
         ? `${(data.metrics.avg_duration_ms / 1000).toFixed(1)}s`
         : '-'
       }
       icon={<Clock className="w-4 h-4" />}
       color="blue"
      />
     </div>
    )}

    {/* 趋势图 */}
    {data?.trends && (
     <div className="space-y-2">
      <div className="flex h-[30px] w-fit items-center overflow-hidden rounded-full border border-border-default bg-surface-card">
       {[7, 14, 30].map(d => (
        <button
         key={d}
         onClick={() => setDays(d)}
         className={cn(
          'h-full px-3.5 text-xs transition-colors',
          d !== 7 && 'border-l border-border-divider',
          days === d ? 'bg-surface-tint font-bold text-content-primary' : 'text-content-muted hover:text-content-primary'
         )}
        >
         {d}D
        </button>
       ))}
      </div>
      <TrendChart trends={data.trends} />
     </div>
    )}

    {/* 运行列表 */}
    <div className="space-y-4">
     <div className="flex items-center justify-between">
      <h2 className="text-sm text-content-muted">
       {t('runList')} ({data?.total_runs_count || 0})
      </h2>
      {data && data.total_runs_count > limit && (
       <div className="flex gap-2">
        <button
         onClick={handlePrevPage}
         disabled={offset === 0}
         className={cn(
          'rounded-full border border-border-divider bg-surface-card px-3.5 py-1.5 text-xs font-medium text-content-secondary',
          offset === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:border-border-hover hover:text-content-primary'
         )}
        >
         {t('prev')}
        </button>
        <button
         onClick={handleNextPage}
         disabled={offset + limit >= data.total_runs_count}
         className={cn(
          'rounded-full border border-border-divider bg-surface-card px-3.5 py-1.5 text-xs font-medium text-content-secondary',
          offset + limit >= data.total_runs_count
           ? 'opacity-50 cursor-not-allowed'
           : 'hover:border-border-hover hover:text-content-primary'
         )}
        >
         {t('next')}
        </button>
       </div>
      )}
     </div>
     {data?.runs && (
      <RunTable runs={data.runs} isAdmin={isAdmin} onRunClick={handleRunClick} />
     )}
    </div>
   </div>
  </div>
 )
}
