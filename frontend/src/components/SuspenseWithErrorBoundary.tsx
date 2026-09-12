import { Suspense, ReactNode } from 'react'
import { The4DPocketLogo } from '@/components/brand'
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
    <div className="flex h-full w-full items-center justify-center bg-surface-page">
      <div className="flex flex-col items-center gap-2.5">
        <div className="h-[26px] w-[26px] overflow-visible">
          <span className="block origin-top-left scale-[0.62]">
            <The4DPocketLogo />
          </span>
        </div>
        <span className="text-xs text-content-muted">…</span>
      </div>
    </div>
  )
}

export default SuspenseWithErrorBoundary
