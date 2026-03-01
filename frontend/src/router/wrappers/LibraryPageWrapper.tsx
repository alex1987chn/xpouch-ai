/**
 * LibraryPage 路由包装器
 * 
 * 职责：
 * - 登录认证守卫
 */

import { Suspense, lazy } from 'react'
import { useRequireAuth } from '../hooks/useRequireAuth'
import { LoadingFallback } from '../components/LoadingFallback'
import { SuspenseWithErrorBoundary } from '@/components/SuspenseWithErrorBoundary'

const LibraryPage = lazy(() => import('@/pages/library/LibraryPage'))

export function LibraryPageWrapper() {
  const isAuthenticated = useRequireAuth()

  if (!isAuthenticated) {
    return <LoadingFallback />
  }

  return (
    <SuspenseWithErrorBoundary fallback={<LoadingFallback />}>
      <LibraryPage />
    </SuspenseWithErrorBoundary>
  )
}
