import { useToast, dismissToast } from './use-toast'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Toaster() {
  const { toasts } = useToast()

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            'flex items-center justify-between gap-3 px-4 py-3 rounded-lg shadow-lg',
            'min-w-[300px] max-w-md',
            'animate-in slide-in-from-bottom-2',
            toast.variant === 'destructive'
              ? 'bg-status-offline text-white'
              : 'bg-surface-card text-content-primary'
          )}
        >
          <div className="flex-1 space-y-1">
            {toast.title && (
              <div className="font-semibold text-sm">{toast.title}</div>
            )}
            {toast.description && (
              <div className="text-xs opacity-90">{toast.description}</div>
            )}
          </div>
          <button
            onClick={() => dismissToast(toast.id)}
            className={cn(
              'opacity-0 transition-opacity hover:opacity-100',
              'rounded-md p-1 text-current'
            )}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  )
}

