/**
 * useOptimisticUpdate - React 19 乐观更新 Hook
 * 
 * 功能：
 * - 用户操作后立即更新 UI（无需等待服务端响应）
 * - 失败时自动回滚到之前的状态
 * 
 * 适用场景：
 * - 发送消息：立即显示在聊天列表中
 * - 更新 artifact：立即显示编辑后的内容
 * - 删除会话：立即从列表中移除
 */

import { useState, useCallback } from 'react'

interface UseOptimisticOptions<T> {
  /** 实际状态（服务端确认后的状态） */
  actualState: T
  /** 更新实际状态的函数 */
  setActualState: (state: T) => void
}

interface UseOptimisticReturn<T> {
  /** 乐观状态（立即更新的 UI 状态） */
  optimisticState: T
  /** 执行乐观更新 */
  execute: (optimisticValue: T, asyncFn: () => Promise<void>) => Promise<void>
  /** 是否正在处理中 */
  isPending: boolean
  /** 错误信息 */
  error: Error | null
  /** 手动回滚 */
  rollback: () => void
}

export function useOptimisticUpdate<T>(
  options: UseOptimisticOptions<T>
): UseOptimisticReturn<T> {
  const { actualState, setActualState } = options
  
  // 乐观状态 = 实际状态 + 乐观更新
  const [optimisticState, setOptimisticState] = useState<T>(actualState)
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  // 当实际状态变化时，同步到乐观状态
  if (!isPending && JSON.stringify(optimisticState) !== JSON.stringify(actualState)) {
    setOptimisticState(actualState)
  }

  const execute = useCallback(async (
    optimisticValue: T,
    asyncFn: () => Promise<void>
  ): Promise<void> => {
    setError(null)
    setIsPending(true)
    
    // 保存原始状态用于回滚
    const originalState = actualState
    
    // 1. 立即更新乐观状态（UI 立即响应）
    setOptimisticState(optimisticValue)
    
    try {
      // 2. 执行异步操作
      await asyncFn()
      
      // 3. 成功：乐观状态与实际状态一致
      setActualState(optimisticValue)
    } catch (err) {
      // 4. 失败：回滚到原始状态
      setOptimisticState(originalState)
      setError(err instanceof Error ? err : new Error(String(err)))
      throw err
    } finally {
      setIsPending(false)
    }
  }, [actualState, setActualState])

  const rollback = useCallback(() => {
    setOptimisticState(actualState)
    setIsPending(false)
    setError(null)
  }, [actualState])

  return {
    optimisticState: isPending ? optimisticState : actualState,
    execute,
    isPending,
    error,
    rollback
  }
}

/**
 * 简化的乐观更新 Hook（针对数组操作）
 * 
 * 适用场景：消息列表、会话列表等
 */
export function useOptimisticList<T extends { id: string }>(
  list: T[],
  setList: (list: T[]) => void
) {
  return useOptimisticUpdate({
    actualState: list,
    setActualState: setList
  })
}
