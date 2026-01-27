import { createContext, useContext, useState, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface Toast {
  id: string
  title?: string
  description?: string
  variant?: 'default' | 'destructive'
}

interface ToastContextType {
  toasts: Toast[]
  toast: (props: Omit<Toast, 'id'>) => void
  dismiss: (id: string) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export function useToast() {
  const context = useContext(ToastContext)
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const toast = (props: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).substring(2, 9)

    setToasts((prev) => [
      ...prev,
      {
        id,
        ...props,
      },
    ])

    // 3秒后自动移除
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3000)
  }

  const dismiss = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  return (
    <ToastContext.Provider value={{ toasts, toast, dismiss }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'flex items-center justify-between gap-3 px-4 py-3 rounded-lg shadow-lg',
              'min-w-[300px] max-w-md',
              'animate-in slide-in-from-bottom-2',
              t.variant === 'destructive'
                ? 'bg-red-500 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white'
            )}
          >
            <div className="flex-1 space-y-1">
              {t.title && (
                <div className="font-semibold text-sm">{t.title}</div>
              )}
              {t.description && (
                <div className="text-xs opacity-90">{t.description}</div>
              )}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              className={cn(
                'opacity-0 transition-opacity hover:opacity-100',
                'rounded-md p-1 text-current'
              )}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
