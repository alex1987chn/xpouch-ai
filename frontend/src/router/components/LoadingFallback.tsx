/**
 * 路由加载中状态组件
 */

export function LoadingFallback() {
  return (
    <div className="h-screen w-full flex items-center justify-center font-mono text-sm text-secondary">
      <div className="flex items-center gap-3">
        <div className="w-2 h-2 bg-accent-brand animate-pulse" />
        <span>INITIALIZING_SYSTEM...</span>
      </div>
    </div>
  )
}
