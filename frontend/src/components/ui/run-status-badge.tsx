/**
 * RunStatusBadge - 运行状态徽章组件
 *
 * 支持两种变体：
 * - simple: 简单徽章（用于表格、列表）
 * - detailed: 带图标和动画（用于详情页）
 *
 * [主题适配]
 * - 使用透明度色值适配 Light/Dark 主题
 */

import { Clock, AlertCircle, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RunStatus } from '@/types/run'

// ============================================
// 状态配置
// ============================================

interface StatusConfig {
  label: string
  simpleClass: string
  detailedClass: string
  icon: typeof Clock
  animate?: boolean
}

const statusConfig: Record<RunStatus, StatusConfig> = {
  queued: {
    label: 'Queued',
    simpleClass: 'bg-content-muted/20 text-content-secondary',
    detailedClass: 'text-content-secondary',
    icon: Clock,
  },
  running: {
    label: 'Running',
    simpleClass: 'bg-status-info/20 text-status-info',
    detailedClass: 'text-accent-primary',
    icon: Loader2,
    animate: true,
  },
  waiting_for_approval: {
    label: 'HITL',
    simpleClass: 'bg-status-warning/20 text-status-warning',
    detailedClass: 'text-status-warning',
    icon: AlertCircle,
  },
  resuming: {
    label: 'Resuming',
    simpleClass: 'bg-status-info/20 text-status-info',
    detailedClass: 'text-accent-primary',
    icon: Loader2,
    animate: true,
  },
  completed: {
    label: 'Done',
    simpleClass: 'bg-status-online/20 text-status-online',
    detailedClass: 'text-status-online',
    icon: CheckCircle,
  },
  failed: {
    label: 'Failed',
    simpleClass: 'bg-status-offline/20 text-status-offline',
    detailedClass: 'text-status-offline',
    icon: XCircle,
  },
  cancelled: {
    label: 'Cancelled',
    simpleClass: 'bg-content-muted/20 text-content-secondary',
    detailedClass: 'text-content-secondary',
    icon: XCircle,
  },
  timed_out: {
    label: 'Timeout',
    simpleClass: 'bg-status-offline/20 text-status-offline',
    detailedClass: 'text-status-offline',
    icon: AlertCircle,
  },
}

// ============================================
// 组件定义
// ============================================

export interface RunStatusBadgeProps {
  status: RunStatus
  /**
   * 变体：
   * - simple: 简单徽章（用于表格、列表）
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
  const config = statusConfig[status] || statusConfig.queued
  const Icon = config.icon

  if (variant === 'detailed') {
    return (
      <span className={cn('inline-flex items-center gap-1.5 text-sm font-medium', config.detailedClass, className)}>
        <Icon className={cn('h-4 w-4', config.animate ? 'animate-spin' : '')} />
        {config.label}
      </span>
    )
  }

  // simple 变体
  return (
    <span className={cn('px-2 py-0.5 text-xs font-mono uppercase', config.simpleClass, className)}>
      {config.label}
    </span>
  )
}

// 导出类型和组件
export type { RunStatus }
