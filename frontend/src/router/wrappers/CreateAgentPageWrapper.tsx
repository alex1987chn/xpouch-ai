/**
 * CreateAgentPage 路由包装器
 * 
 * 职责：
 * - 集成创建智能体业务逻辑
 */

import { Suspense } from 'react'
import { lazyWithReload } from '../lazyWithReload'
import { useCreateAgent } from '../hooks/useCreateAgent'
import { LoadingFallback } from '../components/LoadingFallback'

const CreateAgentPage = lazyWithReload(() => import('@/pages/agent/CreateAgentPage'))

export function CreateAgentPageWrapper() {
  const { handleSave, handleCancel } = useCreateAgent()

  return (
    <Suspense fallback={<LoadingFallback />}>
      <CreateAgentPage
        onBack={handleCancel}
        onSave={handleSave}
      />
    </Suspense>
  )
}
