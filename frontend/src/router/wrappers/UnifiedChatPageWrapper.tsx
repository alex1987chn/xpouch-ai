/**
 * UnifiedChatPage 路由包装器
 * 
 * 职责：
 * - 根据 conversationId 强制重新创建组件实例
 */

import { Suspense, lazy } from 'react'
import { useParams } from 'react-router-dom'
import { LoadingFallback } from '../components/LoadingFallback'

const UnifiedChatPage = lazy(() => import('@/pages/chat/UnifiedChatPage'))

export function UnifiedChatPageWrapper() {
  const { id } = useParams<{ id: string }>()

  // 关键：使用 key 强制组件在 conversationId 变化时重新创建
  // 避免 React 复用组件实例导致状态混乱
  return (
    <Suspense fallback={<LoadingFallback />}>
      <UnifiedChatPage key={id || 'new'} />
    </Suspense>
  )
}
