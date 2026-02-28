/**
 * 异步错误处理 Hook
 * 用于在异步操作中抛出错误，能够被 React Error Boundary 捕获
 */

import { useState, useCallback } from 'react'

/**
 * useAsyncError - 用于在异步回调中触发错误边界
 * 
 * 使用场景: 在事件处理器、setTimeout、Promise 回调等异步上下文中需要抛出错误时
 * 
 * @example
 * const throwError = useAsyncError()
 * 
 * const handleClick = async () => {
 *   try {
 *     await someAsyncOperation()
 *   } catch (err) {
 *     throwError(err)
 *   }
 * }
 */
export function useAsyncError() {
  const [_, setError] = useState<Error | null>(null)
  
  return useCallback((error: Error | unknown) => {
    // 将错误放入 setState，触发组件重新渲染并抛出错误
    setError(() => {
      const err = error instanceof Error ? error : new Error(String(error))
      throw err
    })
  }, [])
}
