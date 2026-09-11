/**
 * 错误态 / 空态统一组件（全站唯一状态展示）。
 *
 * - ErrorState：加载失败统一形态（图标 + 原因 + 重试）
 * - EmptyState：空态统一形态，两档：
 *   - card（默认）：虚线卡——页面级/区域级「没有数据」（带引导 CTA 时必用）
 *   - bare：无框轻量——面板列表内的「没有匹配/没有条目」
 *
 * 图标可选（默认 Inbox），圆形浅底 + 主文案 13.5px + 副文案 12px + 可选胶囊 CTA。
 */

import { AlertTriangle, Inbox, RotateCw } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useTranslation } from '@/i18n'
import { cn } from '@/lib/utils'

interface ErrorStateProps {
  /** 失败原因（缺省用通用「加载失败」文案） */
  message?: string
  /** 提供则显示重试按钮 */
  onRetry?: () => void
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  const { t } = useTranslation()
  return (
    <div className="rounded-md border border-border-divider bg-surface-card px-6 py-14 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent-destructive/10">
        <AlertTriangle className="h-6 w-6 text-accent-destructive" />
      </div>
      <h3 className="text-sm font-bold text-content-primary">
        {t('loadFailed')}
      </h3>
      {message && <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-content-muted">{message}</p>}
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 inline-flex items-center gap-2 rounded-full border border-border-divider bg-surface-page px-4 py-2 text-xs font-bold text-content-secondary transition-colors hover:border-border-hover hover:text-content-primary"
        >
          <RotateCw className="h-3.5 w-3.5" />
          {t('retryAction')}
        </button>
      )}
    </div>
  )
}

interface EmptyStateProps {
  title: string
  description?: string
  /** 行动引导 CTA（跳转目标 + 文案），缺省无按钮 */
  action?: {
    label: string
    onClick: () => void
  }
  /** 图标（默认收件箱），card 形态显示 */
  icon?: LucideIcon
  /** card = 虚线卡（页面级）；bare = 无框轻量（面板列表内） */
  variant?: 'card' | 'bare'
  /** 紧凑内距（嵌入小面板时） */
  dense?: boolean
  className?: string
}

export function EmptyState({
  title,
  description,
  action,
  icon: Icon = Inbox,
  variant = 'card',
  dense = false,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'text-center',
        variant === 'card' &&
          cn(
            'rounded-lg border border-dashed border-border-divider bg-surface-tint/30',
            dense ? 'px-6 py-8' : 'px-6 py-12'
          ),
        variant === 'bare' && (dense ? 'py-5' : 'py-8'),
        className
      )}
    >
      {variant === 'card' && (
        <div
          className={cn(
            'mx-auto mb-3 flex items-center justify-center rounded-full bg-surface-card shadow-theme-card',
            dense ? 'h-10 w-10' : 'h-12 w-12'
          )}
        >
          <Icon className={cn('text-content-secondary', dense ? 'h-[18px] w-[18px]' : 'h-5 w-5')} />
        </div>
      )}
      <h3 className={cn('font-bold text-content-primary', dense ? 'text-[13px]' : 'text-[13.5px]')}>
        {title}
      </h3>
      {description && (
        <p className={cn('mx-auto mt-1 leading-relaxed text-content-muted', dense ? 'max-w-xs text-[11.5px]' : 'max-w-sm text-xs')}>
          {description}
        </p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 inline-flex items-center gap-2 rounded-full border border-border-divider bg-accent-brand px-5 py-2 text-xs font-bold text-accent-ink transition-all hover:-translate-y-px hover:shadow-theme-card"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
