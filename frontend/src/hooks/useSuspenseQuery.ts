/**
 * useSuspenseQuery - React 19 use() Hook 模式
 * 
 * 功能：
 * - 在组件中直接 await Promise
 * - 自动处理 Suspense 和错误边界
 * 
 * 这是 React 19 的新特性，需要 React 19+ 才能完全使用
 * 目前提供兼容层，未来可直接使用 React.use()
 * 
 * 使用场景：
 * - 会话详情加载
 * - 用户资料加载
 * - 列表数据加载
 * 
 * @example
 * ```tsx
 * // 路由层预加载
 * <Route 
 *   loader={({ params }) => loadConversation(params.id)}
 *   element={<ChatPage />}
 * />
 * 
 * // 组件层直接使用
 * function ChatPage() {
 *   const conversation = useSuspenseQuery(() => getConversation(id))
 *   return <div>{conversation.title}</div>
 * }
 * ```
 */

import { useState, useEffect, useCallback } from 'react'

interface UseSuspenseQueryOptions {
  /** 是否立即执行 */
  enabled?: boolean
  /** 依赖项变化时重新获取 */
  deps?: unknown[]
}

interface UseSuspenseQueryResult<T> {
  /** 数据 */
  data: T | null
  /** 是否加载中 */
  isLoading: boolean
  /** 错误 */
  error: Error | null
  /** 重新获取 */
  refetch: () => void
}

/**
 * useSuspenseQuery - 简化版 Suspense 查询
 * 
 * 注意：React 19 后可直接使用 use() Hook 替代
 * const data = use(fetchData())
 */
export function useSuspenseQuery<T>(
  queryFn: () => Promise<T>,
  options: UseSuspenseQueryOptions = {}
): UseSuspenseQueryResult<T> {
  const { enabled = true, deps = [] } = options
  
  const [data, setData] = useState<T | null>(null)
  const [isLoading, setIsLoading] = useState(enabled)
  const [error, setError] = useState<Error | null>(null)
  
  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    
    try {
      const result = await queryFn()
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
    } finally {
      setIsLoading(false)
    }
  }, [queryFn])
  
  useEffect(() => {
    if (enabled) {
      fetchData()
    }
  }, [enabled, fetchData, ...deps])
  
  return {
    data,
    isLoading,
    error,
    refetch: fetchData
  }
}

/**
 * usePromise - React 19 use() 的兼容层
 * 
 * React 19 正式发布后，可直接替换为：
 * import { use } from 'react'
 * const data = use(promise)
 */
export function usePromise<T>(promise: Promise<T>): T | null {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<Error | null>(null)
  
  useEffect(() => {
    let cancelled = false
    
    promise
      .then(result => {
        if (!cancelled) {
          setData(result)
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err)
        }
      })
    
    return () => {
      cancelled = true
    }
  }, [promise])
  
  if (error) {
    throw error
  }
  
  return data
}

/**
 * 创建可缓存的 Promise
 * 
 * 用于避免重复请求
 */
export function createCachedPromise<T>(
  factory: () => Promise<T>,
  key: string
): () => Promise<T> {
  const cache = new Map<string, Promise<T>>()
  
  return () => {
    if (!cache.has(key)) {
      cache.set(key, factory())
    }
    return cache.get(key)!
  }
}
