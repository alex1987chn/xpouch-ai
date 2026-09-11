/**
 * RunStatusBadge - 运行状态徽章组件
 *
 * [规范] 状态色板全站统一：
 * - 进行中（running/resuming）= 鼠尾草绿 + 脉冲点
 * - 待裁决（waiting_for_approval）= 琥珀 + 脉冲点
 * - 完成 = 绿静止点 / 失败·超时 = 红 / 排队·取消 = 中性灰
 * simple 变体 = 圆角胶囊（列表行内用）；detailed = 图标+文字。
 */

import { Clock, AlertCircle, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n'
import type { RunStatus } from '@/types/run'

interface StatusConfig {
  labelKey?: 'chipAwaiting' | 'chipRunning'
  fallbackLabel: string
  chipClass: string
  detailedClass: string
  icon: typeof Clock
  pulse?: boolean
  animate?: boolean
}

const statusConfig: Record<RunStatus, StatusConfig> = {
  queued: {
    fallbackLabel: 'Queued',
    chipClass: 'bg-surface-tint text-content-secondary',
    detailedClass: 'text-content-secondary',
    icon: Clock,
  },
  running: {
    labelKey: 'chipRunning',
    fallbackLabel: 'Running',
    chipClass: 'bg-status-online/12 text-status-online',
    detailedClass: 'text-status-online',
    icon: Loader2,
    pulse: true,
    animate: true,
  },
  waiting_for_approval: {
    labelKey: 'chipAwaiting',
    fallbackLabel: 'Review',
    chipClass: 'bg-accent-warning/12 text-accent-warning',
    detailedClass: 'text-accent-warning',
    icon: AlertCircle,
    pulse: true,
  },
  resuming: {
    labelKey: 'chipRunning',
    fallbackLabel: 'Resuming',
    chipClass: 'bg-status-online/12 text-status-online',
    detailedClass: 'text-status-online',
    icon: Loader2,
    pulse: true,
    animate: true,
  },
  completed: {
    fallbackLabel: 'Done',
    chipClass: 'bg-status-online/12 text-status-online',
    detailedClass: 'text-status-online',
    icon: CheckCircle,
  },
  failed: {
    fallbackLabel: 'Failed',
    chipClass: 'bg-accent-destructive/12 text-accent-destructive',
    detailedClass: 'text-accent-destructive',
    icon: XCircle,
  },
  cancelled: {
    fallbackLabel: 'Cancelled',
    chipClass: 'bg-surface-tint text-content-secondary',
    detailedClass: 'text-content-secondary',
    icon: XCircle,
  },
  timed_out: {
    fallbackLabel: 'Timeout',
    chipClass: 'bg-accent-destructive/12 text-accent-destructive',
    detailedClass: 'text-accent-destructive',
    icon: AlertCircle,
  },
}

export interface RunStatusBadgeProps {
  status: RunStatus
  /**
   * 变体：
   * - simple: 胶囊徽章（用于行卡、列表）
   * - detailed: 带图标和动画（用于详情页）
   */
  variant?: 'simple' | 'detailed'
  className?: string
}

export function RunStatusBadge({
  status,
  variant = 'simple',
  className,
}: RunStatusBadgeProps) {
  const { t } = useTranslation()
  const config = statusConfig[status] || statusConfig.queued
  const Icon = config.icon
  const label = config.labelKey ? t(config.labelKey) : config.fallbackLabel

  if (variant === 'detailed') {
    return (
      <span className={cn('inline-flex items-center gap-1.5 text-sm font-medium', config.detailedClass, className)}>
        <Icon className={cn('h-4 w-4', config.animate ? 'animate-spin' : '')} />
        {label}
      </span>
    )
  }

  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-nano font-medium', config.chipClass, className)}>
      {config.pulse && <span className="h-1 w-1 animate-pulse rounded-full bg-current" />}
      {label}
    </span>
  )
}

// 导出类型和组件
export type { RunStatus }
