/**
 * CreateAgentPage 路由包装器
 * 
 * 职责：
 * - 集成创建智能体业务逻辑
 */

import { Suspense, lazy } from 'react'
import { useCreateAgent } from '../hooks/useCreateAgent'
import { LoadingFallback } from '../components/LoadingFallback'

const CreateAgentPage = lazy(() => import('@/pages/agent/CreateAgentPage'))

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
