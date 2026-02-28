import { useState, useEffect } from 'react'

export interface Toast {
  id: string
  title?: string
  description?: string
  variant?: 'default' | 'destructive'
}

// 全局 toast 状态（单例模式）
let globalToasts: Toast[] = []
const globalListeners: Set<() => void> = new Set()

export function dismissToast(id: string) {
  globalToasts = globalToasts.filter(t => t.id !== id)
  globalListeners.forEach(listener => listener([...globalToasts]))
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    // 注册监听器
    globalListeners.add(setToasts)

    // 初始化 toast
    setToasts([...globalToasts])

    return () => {
      // 清理监听器
      globalListeners.delete(setToasts)
    }
  }, [])

  const toast = (props: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).substring(2, 9)
    const newToast: Toast = {
      id,
      ...props,
    }

    // 更新全局状态
    globalToasts = [...globalToasts, newToast]

    // 通知所有监听器
    globalListeners.forEach(listener => listener([...globalToasts]))

    // 3秒后自动移除
    setTimeout(() => {
      dismissToast(id)
    }, 3000)
  }

  return {
    toast,
    toasts,
  }
}

export type { Toast }

