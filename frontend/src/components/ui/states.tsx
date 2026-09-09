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
    <div className="border-2 border-border-default bg-surface-card px-6 py-16 text-center shadow-theme-card">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center border-2 border-border-default bg-surface-page">
        <AlertTriangle className="h-8 w-8 text-accent-destructive" />
      </div>
      <h3 className="font-mono text-sm font-bold uppercase text-content-primary">
        {t('loadFailed')}
      </h3>
      {message && <p className="mt-2 text-xs text-content-secondary">{message}</p>}
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 border-2 border-border-default bg-surface-page text-xs font-bold uppercase text-content-secondary hover:border-accent hover:text-content-primary transition-colors"
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
    <div className="border-2 border-border-default bg-surface-card px-6 py-16 text-center shadow-theme-card">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center border-2 border-border-default bg-surface-page">
        <Inbox className="h-8 w-8 text-content-muted" />
      </div>
      <h3 className="font-mono text-sm font-bold uppercase text-content-primary">{title}</h3>
      {description && <p className="mt-2 text-xs text-content-secondary">{description}</p>}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 border-2 border-border-default bg-accent-hover text-content-primary text-xs font-bold uppercase hover:brightness-95 transition-all"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
