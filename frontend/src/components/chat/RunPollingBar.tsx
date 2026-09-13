/**
 * 运行轮询状态栏
 *
 * 显示在输入框上方，用于提示用户任务正在恢复执行中。
 *
 * @features
 * - 显示当前状态和刷新按钮
 * - 轮询期间禁用输入
 * - 错误状态显示
 */

import { Loader2, RefreshCw, AlertTriangle } from 'lucide-react'
import { useTranslation } from '@/i18n'
import { cn } from '@/lib/utils'
import type { RunStatus } from '@/types/run'

interface RunPollingBarProps {
  /** 是否显示 */
  show: boolean
  /** 当前状态 */
  status: RunStatus | null
  /** 是否处于 HITL 暂停状态 */
  isHITLPaused: boolean
  /** 是否遇到错误 */
  hasError?: boolean
  /** 刷新按钮回调 */
  onRefresh: () => void
}

const STATUS_LABELS: Record<RunStatus, string> = {
  queued: 'Queued',
  running: 'Running',
  waiting_for_approval: 'Waiting for Approval',
  resuming: 'Resuming',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
  timed_out: 'Timed Out',
}

export function RunPollingBar({
  show,
  status,
  isHITLPaused,
  hasError = false,
  onRefresh,
}: RunPollingBarProps) {
  const { t } = useTranslation()

  if (!show) return null

  // 状态还没取到（首帧查询在途）时不写 "(Unknown)"：那是内部词表的兜底值，
  // 对用户是无意义的噪音（曾经因为状态机泄漏长期停留在这个文案上）。
  const statusLabel = status ? STATUS_LABELS[status] : null

  return (
    <div
      className={cn(
        'flex items-center justify-between px-4 py-2',
        'border-b border-border-divider',
        'text-sm',
        hasError
          ? 'bg-status-offline/10 text-status-offline'
          : 'bg-surface-tint'
      )}
    >
      <div className="flex items-center gap-2">
        {hasError ? (
          <>
            <AlertTriangle className="h-4 w-4 text-status-offline" />
            <span className="text-status-offline font-medium">
              {t('pollingError')}
            </span>
          </>
        ) : (
          <>
            <Loader2 className="h-4 w-4 animate-spin text-accent-brand" />
            <span className="text-content-primary">
              {isHITLPaused
                ? t('pollingHitlPaused')
                : statusLabel
                  ? `${t('pollingRestoring')} (${statusLabel})`
                  : t('pollingRestoring')}
            </span>
          </>
        )}
      </div>
      <button
        onClick={onRefresh}
        className={cn(
          'flex items-center gap-1 px-2 py-1',
          'text-xs text-content-secondary hover:text-content-primary',
          'hover:bg-surface-tint rounded transition-colors'
        )}
        title={t('pollingRefresh')}
      >
        <RefreshCw className="h-3 w-3" />
        {t('pollingRefresh')}
      </button>
    </div>
  )
}
