/**
 * WorkbenchPageWrapper - 工作台路由包装器
 *
 * 模式与 ArtifactsPageWrapper 一致：鉴权 + 懒加载 + 错误边界。
 * 线程重挂载由 WorkbenchPage 内部 key 控制（地层不随线程切换重挂载）。
 */

import { lazyWithReload } from '../lazyWithReload'
import { useRequireAuth } from '../hooks/useRequireAuth'
import { LoadingFallback } from '../components/LoadingFallback'
import { SuspenseWithErrorBoundary } from '@/components/SuspenseWithErrorBoundary'

const WorkbenchPage = lazyWithReload(() => import('@/pages/workbench/WorkbenchPage'))

export function WorkbenchPageWrapper() {
  const isAuthenticated = useRequireAuth()

  if (!isAuthenticated) {
    return <LoadingFallback />
  }

  return (
    <SuspenseWithErrorBoundary fallback={<LoadingFallback />}>
      <WorkbenchPage />
    </SuspenseWithErrorBoundary>
  )
}
