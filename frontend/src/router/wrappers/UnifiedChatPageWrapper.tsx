/**
 * UnifiedChatPage 路由包装器
 *
 * 职责：
 * - 根据 threadId 强制重新创建组件实例
 * - 提供 Suspense + ErrorBoundary（全 app 最复杂的页面，渲染错误隔离为页面级
 *   fallback，不再卸载整棵应用树）
 */

import { Suspense } from 'react'
import { lazyWithReload } from '../lazyWithReload'
import { useParams } from 'react-router-dom'
import { LoadingFallback } from '../components/LoadingFallback'
import { SuspenseWithErrorBoundary } from '@/components/SuspenseWithErrorBoundary'

const UnifiedChatPage = lazyWithReload(() => import('@/pages/chat/UnifiedChatPage'))

export function UnifiedChatPageWrapper() {
  const { id } = useParams<{ id: string }>()

  // 关键：使用 key 强制组件在 threadId 变化时重新创建
  // 避免 React 复用组件实例导致状态混乱
  return (
    <SuspenseWithErrorBoundary fallback={<LoadingFallback />}>
      <Suspense fallback={<LoadingFallback />}>
        <UnifiedChatPage key={id || 'new'} />
      </Suspense>
    </SuspenseWithErrorBoundary>
  )
}
