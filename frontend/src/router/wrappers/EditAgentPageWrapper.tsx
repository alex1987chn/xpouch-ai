/**
 * EditAgentPage 路由包装器
 * 
 * 职责：
 * - 集成编辑智能体业务逻辑
 * - 数据加载状态处理
 */

import { Suspense, lazy } from 'react'
import { useEditAgent } from '../hooks/useEditAgent'
import { LoadingFallback } from '../components/LoadingFallback'

const CreateAgentPage = lazy(() => import('@/pages/agent/CreateAgentPage'))

export function EditAgentPageWrapper() {
  const { id, agentData, isLoading, handleSave, handleCancel } = useEditAgent()

  if (isLoading) {
    return <LoadingFallback />
  }

  return (
    <Suspense fallback={<LoadingFallback />}>
      {/* 使用 key 强制组件在 id 变化时重新挂载，避免 useEffect 同步 Props 反模式 */}
      <CreateAgentPage
        key={`edit-agent-${id}`}
        onBack={handleCancel}
        onSave={handleSave}
        initialData={agentData}
        isEditMode={true}
      />
    </Suspense>
  )
}
