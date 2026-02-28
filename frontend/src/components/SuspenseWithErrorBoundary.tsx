import { Suspense, ReactNode } from 'react'
import ErrorBoundary from './ErrorBoundary'

interface SuspenseWithErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
  errorFallback?: ReactNode
}

/**
 * Suspense + Error Boundary 组合组件
 * 
 * 用于包裹懒加载的组件，提供：
 * 1. 加载状态显示 (Suspense fallback)
 * 2. 错误捕获和优雅降级 (Error Boundary)
 * 
 * 使用场景：路由懒加载、动态导入的组件
 * 
 * @example
 * <SuspenseWithErrorBoundary fallback={<Loading />}>
 *   <LazyLoadedComponent />
 * </SuspenseWithErrorBoundary>
 */
export function SuspenseWithErrorBoundary({
  children,
  fallback,
  errorFallback,
}: SuspenseWithErrorBoundaryProps) {
  return (
    <ErrorBoundary fallback={errorFallback}>
      <Suspense fallback={fallback || <DefaultLoadingFallback />}>
        {children}
      </Suspense>
    </ErrorBoundary>
  )
}

/**
 * 默认加载 fallback
 */
function DefaultLoadingFallback() {
  return (
    <div className="h-screen w-full flex items-center justify-center font-mono text-sm text-secondary">
      <div className="flex items-center gap-3">
        <div className="w-2 h-2 bg-[var(--accent)] animate-pulse" />
        <span>INITIALIZING...</span>
      </div>
    </div>
  )
}

export default SuspenseWithErrorBoundary
