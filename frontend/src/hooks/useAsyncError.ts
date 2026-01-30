/**
 * 统一异步错误处理 Hook
 * 用于处理 API 调用、异步操作的错误，并提供统一的用户提示
 */

import { useCallback } from 'react'
import { errorHandler, type AppError } from '@/utils/logger'
import { useTranslation } from '@/i18n'
import { toast } from '@/components/ui/use-toast'

interface UseAsyncErrorOptions {
  /** 是否显示 Toast 错误提示（默认 true） */
  showToast?: boolean
  /** 自定义错误消息（优先级高于翻译） */
  customMessage?: string
  /** 错误回调 */
  onError?: (error: Error) => void
}

/**
 * 统一异步错误处理 Hook
 */
export function useAsyncError() {
  const { t } = useTranslation()

  const handleAsyncError = useCallback(
    async <T>(
      asyncFn: () => Promise<T>,
      options: UseAsyncErrorOptions = {}
    ): Promise<T | null> => {
      const {
        showToast = true,
        customMessage,
        onError
      } = options

      try {
        return await asyncFn()
      } catch (error) {
        // 使用统一的错误处理器
        errorHandler.handle(error, 'useAsyncError')

        // 获取用户友好的错误消息
        const userMessage = customMessage || errorHandler.getUserMessage(error)

        // 显示 Toast 错误提示
        if (showToast) {
          toast({
            title: t('error.title', { defaultValue: '操作失败' }),
            description: userMessage,
            variant: 'destructive',
          })
        }

        // 调用错误回调
        if (onError && error instanceof Error) {
          onError(error)
        }

        return null
      }
    },
    [t]
  )

  return {
    handleAsyncError,
    /**
     * 简化版本：直接抛出错误，不处理
     */
    wrapAsync: useCallback(<T>(asyncFn: () => Promise<T>) => {
      return asyncFn()
    }, [])
  }
}

/**
 * 高阶函数：包装异步函数，自动处理错误
 */
export function withAsyncError<T extends any[], R>(
  fn: (...args: T) => Promise<R>,
  options?: UseAsyncErrorOptions
) {
  return async (...args: T): Promise<R | null> => {
    const {
      showToast = true,
      customMessage,
      onError
    } = options || {}

    try {
      return await fn(...args)
    } catch (error) {
      errorHandler.handle(error, 'withAsyncError')

      const userMessage = customMessage || errorHandler.getUserMessage(error)

      if (showToast) {
        toast({
          title: '操作失败',
          description: userMessage,
          variant: 'destructive',
        })
      }

      if (onError && error instanceof Error) {
        onError(error)
      }

      return null
    }
  }
}
