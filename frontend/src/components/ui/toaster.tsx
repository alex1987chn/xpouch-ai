import { useToast, dismissToast } from './use-toast'
import { X, CheckCircle, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Toaster - 全局通知（统一规范）
 * 底部居中、胶囊卡：默认 = 绿点成功语汇；destructive = 红点 + 标题红。
 */
export function Toaster() {
  const { toasts } = useToast()

  return (
    <div className="pointer-events-none fixed bottom-10 left-1/2 z-[9999] flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            'pointer-events-auto flex items-center gap-3 rounded-full border border-border-divider bg-surface-card py-2.5 pl-4 pr-2 shadow-theme-modal',
            'animate-in slide-in-from-bottom-2 duration-200',
            'min-w-[260px] max-w-md'
          )}
        >
          {toast.variant === 'destructive' ? (
            <AlertTriangle className="h-4 w-4 shrink-0 text-accent-destructive" />
          ) : (
            <CheckCircle className="h-4 w-4 shrink-0 text-accent-success" />
          )}
          <div className="min-w-0 flex-1 space-y-0.5">
            {toast.title && (
              <div className={cn(
                'truncate text-[13px] font-medium',
                toast.variant === 'destructive' ? 'text-accent-destructive' : 'text-content-primary'
              )}>
                {toast.title}
              </div>
            )}
            {toast.description && (
              <div className="truncate text-xs text-content-muted">{toast.description}</div>
            )}
          </div>
          <button
            onClick={() => dismissToast(toast.id)}
            aria-label="Dismiss"
            className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center',
              'rounded-full text-content-muted transition-colors hover:bg-surface-tint hover:text-content-primary'
            )}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}
