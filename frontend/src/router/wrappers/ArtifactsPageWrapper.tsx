/**
 * ArtifactsPage 路由包装器
 *
 * 职责：
 * - 登录认证守卫
 */

import { lazyWithReload } from '../lazyWithReload'
import { useRequireAuth } from '../hooks/useRequireAuth'
import { LoadingFallback } from '../components/LoadingFallback'
import { SuspenseWithErrorBoundary } from '@/components/SuspenseWithErrorBoundary'

const ArtifactsPage = lazyWithReload(() => import('@/pages/artifacts/ArtifactsPage'))

export function ArtifactsPageWrapper() {
  const isAuthenticated = useRequireAuth()

  if (!isAuthenticated) {
    return <LoadingFallback />
  }

  return (
    <SuspenseWithErrorBoundary fallback={<LoadingFallback />}>
      <ArtifactsPage />
    </SuspenseWithErrorBoundary>
  )
}
