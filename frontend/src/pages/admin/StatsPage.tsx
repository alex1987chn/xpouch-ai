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
import { cn } from '@/lib/utils'
import { useUserStore } from '@/store/userStore'
import { getRunStats } from '@/services/stats'
import type { RunStatsResponse, RunListItem } from '@/types/stats'
import type { RunStatus } from '@/types/run'
import { logger } from '@/utils/logger'

// 图标组件
import { BarChart3, CheckCircle, XCircle, AlertTriangle, Clock, ExternalLink } from 'lucide-react'

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
  // 使用语义化颜色，适配暗色主题
  const colorClasses = {
    green: 'border-green-500/50 bg-green-500/10',
    red: 'border-red-500/50 bg-red-500/10',
    yellow: 'border-yellow-500/50 bg-yellow-500/10',
    blue: 'border-blue-500/50 bg-blue-500/10',
  }

  const iconColorClasses = {
    green: 'text-green-500',
    red: 'text-red-500',
    yellow: 'text-yellow-500',
    blue: 'text-blue-500',
  }

  return (
    <div className={cn('border-2 p-4 shadow-hard bg-surface-card', colorClasses[color])}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-mono uppercase text-content-muted">{title}</span>
        <span className={iconColorClasses[color]}>{icon}</span>
      </div>
      <div className="text-2xl font-bold font-mono text-content-primary">{value}</div>
      {subtitle && <div className="text-xs text-content-muted mt-1">{subtitle}</div>}
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
      <div className="border-2 border-border-default p-8 text-center text-content-muted">
        {t('noData')}
      </div>
    )
  }

  const maxValue = Math.max(...trends.map((d) => d.total_count), 1)

  return (
    <div className="border-2 border-border-default p-4 shadow-hard">
      <h3 className="text-sm font-mono uppercase text-content-muted mb-4">
        {t('trends')} (7{t('days')})
      </h3>
      <div className="flex items-end justify-between gap-2 h-32">
        {trends.map((day) => (
          <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
            <div className="w-full flex flex-col gap-0.5">
              {/* 成功 */}
              <div
                className="w-full bg-green-500/70 rounded-t"
                style={{
                  height: `${(day.success_count / maxValue) * 80}px`,
                  minHeight: day.success_count > 0 ? '4px' : '0',
                }}
              />
              {/* 失败 */}
              <div
                className="w-full bg-red-500/70 rounded-b"
                style={{
                  height: `${(day.failed_count / maxValue) * 80}px`,
                  minHeight: day.failed_count > 0 ? '4px' : '0',
                }}
              />
            </div>
            <span className="text-[10px] font-mono text-content-muted">
              {day.date.slice(5)}
            </span>
          </div>
        ))}
      </div>
      <div className="flex gap-4 mt-4 text-xs text-content-secondary">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-green-500/70 rounded" />
          <span>{t('success')}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-red-500/70 rounded" />
          <span>{t('failed')}</span>
        </div>
      </div>
    </div>
  )
}

/**
 * 状态徽章
 */
function StatusBadge({ status }: { status: RunStatus }) {
  // 使用透明度适配暗色主题
  const statusConfig: Record<string, { label: string; className: string }> = {
    'queued': { label: 'Queued', className: 'bg-gray-500/20 text-gray-500' },
    'running': { label: 'Running', className: 'bg-blue-500/20 text-blue-500' },
    'waiting_for_approval': { label: 'HITL', className: 'bg-yellow-500/20 text-yellow-500' },
    'resuming': { label: 'Resuming', className: 'bg-blue-500/20 text-blue-500' },
    'completed': { label: 'Done', className: 'bg-green-500/20 text-green-500' },
    'failed': { label: 'Failed', className: 'bg-red-500/20 text-red-500' },
    'cancelled': { label: 'Cancelled', className: 'bg-gray-500/20 text-gray-500' },
    'timed_out': { label: 'Timeout', className: 'bg-red-500/20 text-red-500' },
  }

  const config = statusConfig[status] || statusConfig['queued']

  return (
    <span className={cn('px-2 py-0.5 text-xs font-mono uppercase', config.className)}>
      {config.label}
    </span>
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
      <div className="border-2 border-border-default p-8 text-center text-content-muted">
        {t('noRuns')}
      </div>
    )
  }

  return (
    <div className="border-2 border-border-default shadow-hard overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b-2 border-border-default bg-surface-page">
            <th className="px-4 py-3 text-left text-xs font-mono uppercase text-content-muted">
              Run ID
            </th>
            {isAdmin && (
              <th className="px-4 py-3 text-left text-xs font-mono uppercase text-content-muted">
                User
              </th>
            )}
            <th className="px-4 py-3 text-left text-xs font-mono uppercase text-content-muted">
              Mode
            </th>
            <th className="px-4 py-3 text-left text-xs font-mono uppercase text-content-muted">
              Status
            </th>
            <th className="px-4 py-3 text-left text-xs font-mono uppercase text-content-muted">
              Duration
            </th>
            <th className="px-4 py-3 text-left text-xs font-mono uppercase text-content-muted">
              Created
            </th>
            <th className="px-4 py-3 text-right text-xs font-mono uppercase text-content-muted">
              Action
            </th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr
              key={run.run_id}
              className="border-b border-border-default hover:bg-surface-page transition-colors"
            >
              <td className="px-4 py-3 font-mono text-sm">
                #{run.run_id.slice(0, 8)}
              </td>
              {isAdmin && (
                <td className="px-4 py-3 text-sm">{run.user_name || run.user_id?.slice(0, 8)}</td>
              )}
              <td className="px-4 py-3 text-sm capitalize">{run.mode}</td>
              <td className="px-4 py-3">
                <StatusBadge status={run.status} />
              </td>
              <td className="px-4 py-3 font-mono text-sm">
                {run.duration_ms ? `${(run.duration_ms / 1000).toFixed(1)}s` : '-'}
              </td>
              <td className="px-4 py-3 text-sm text-content-muted">
                {new Date(run.created_at).toLocaleString()}
              </td>
              <td className="px-4 py-3 text-right">
                <button
                  onClick={() => onRunClick(run.run_id)}
                  className="p-1 hover:bg-accent-hover rounded transition-colors"
                  title={t('viewDetails')}
                >
                  <ExternalLink className="w-4 h-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
  const limit = 50

  // 获取统计数据
  const { data, isLoading, error } = useQuery({
    queryKey: ['run-stats', limit, offset],
    queryFn: () => getRunStats(limit, offset),
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
    return (
      <div className="min-h-screen bg-surface-page p-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-16 text-content-muted font-mono">
            {t('loading')}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    logger.error('[StatsPage] 加载失败:', error)
    return (
      <div className="min-h-screen bg-surface-page p-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-16 text-red-600 font-mono">
            {t('loadFailed')}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface-page p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* 页面标题 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BarChart3 className="w-6 h-6" />
            <h1 className="text-xl font-bold font-mono uppercase">
              {isAdmin ? t('globalStats') : t('myStats')}
            </h1>
          </div>
          {isAdmin && (
            <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs font-mono uppercase">
              Admin
            </span>
          )}
        </div>

        {/* 指标卡片 */}
        {data?.metrics && (
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
        {data?.trends && <TrendChart trends={data.trends} />}

        {/* 运行列表 */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-mono uppercase text-content-muted">
              {t('runList')} ({data?.total_runs_count || 0})
            </h2>
            {data && data.total_runs_count > limit && (
              <div className="flex gap-2">
                <button
                  onClick={handlePrevPage}
                  disabled={offset === 0}
                  className={cn(
                    'px-3 py-1 text-xs font-mono uppercase border-2 border-border-default',
                    offset === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-surface-card'
                  )}
                >
                  {t('prev')}
                </button>
                <button
                  onClick={handleNextPage}
                  disabled={offset + limit >= data.total_runs_count}
                  className={cn(
                    'px-3 py-1 text-xs font-mono uppercase border-2 border-border-default',
                    offset + limit >= data.total_runs_count
                      ? 'opacity-50 cursor-not-allowed'
                      : 'hover:bg-surface-card'
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
