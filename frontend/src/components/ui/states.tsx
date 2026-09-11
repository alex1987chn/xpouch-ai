/**
 * 错误态 / 空态统一组件（DESIGN.md §4.4 的状态补全）。
 *
 * - ErrorState：加载失败统一形态（图标 + 原因 + 重试），所有 query 的
 *   error 分支都用它，替代各页自发的红字/裸文案
 * - EmptyState：空态带行动引导 CTA，把「没有数据」变成「下一步去哪」
 */

import { AlertTriangle, Inbox, RotateCw } from 'lucide-react'
import { useTranslation } from '@/i18n'

interface ErrorStateProps {
  /** 失败原因（缺省用通用「加载失败」文案） */
  message?: string
  /** 提供则显示重试按钮 */
  onRetry?: () => void
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  const { t } = useTranslation()
  return (
    <div className="rounded-md border border-border-divider bg-surface-card px-6 py-16 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent-destructive/10">
        <AlertTriangle className="h-8 w-8 text-accent-destructive" />
      </div>
      <h3 className="text-sm font-bold text-content-primary">
        {t('loadFailed')}
      </h3>
      {message && <p className="mt-2 text-xs text-content-secondary">{message}</p>}
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 inline-flex items-center gap-2 rounded-full border border-border-divider bg-surface-page px-4 py-2 text-xs font-bold text-content-secondary transition-colors hover:border-border-hover hover:text-content-primary"
        >
          <RotateCw className="w-3.5 h-3.5" />
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
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="rounded-md border border-border-divider bg-surface-card px-6 py-16 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-surface-tint">
        <Inbox className="h-8 w-8 text-content-muted" />
      </div>
      <h3 className="text-sm font-bold text-content-primary">{title}</h3>
      {description && <p className="mt-2 text-xs text-content-secondary">{description}</p>}
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
