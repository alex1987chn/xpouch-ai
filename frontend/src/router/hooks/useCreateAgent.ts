/**
 * 创建智能体业务逻辑 Hook
 */

import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useChatStore } from '@/store/chatStore'
import { createCustomAgent } from '@/services/api'
import type { Agent } from '@/types'
import { logger } from '@/utils/logger'
import { useTranslation } from '@/i18n'
import { agentsKeys } from '@/hooks/queries'
import type { CreateAgentRequest } from '@/services/agent'

export interface AgentFormData extends CreateAgentRequest {
  icon: string
  color?: string
}

export function useCreateAgent() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const addCustomAgent = useChatStore(state => state.addCustomAgent)
  const { t } = useTranslation()

  const handleSave = async (agent: AgentFormData): Promise<void> => {
    try {
      const savedAgent = await createCustomAgent({
        name: agent.name,
        description: agent.description,
        systemPrompt: agent.systemPrompt,
        category: agent.category,
        modelId: agent.modelId
      })

      const agentWithUI: Agent = {
        ...savedAgent,
        description: savedAgent.description || '',
        category: savedAgent.category || '综合',
        modelId: savedAgent.model_id,
        icon: agent.icon || 'bot',
        color: agent.color,
        isCustom: true
      }

      addCustomAgent(agentWithUI)

      // 🔥 使用 React Query 缓存失效，确保首页能获取到最新数据
      queryClient.invalidateQueries({ queryKey: agentsKeys.lists() })

      // 导航到首页并切换到"我的智能体"标签
      navigate('/', { state: { agentTab: 'my' } })
    } catch (error) {
      logger.error('保存智能体失败:', error)
      alert(t('saveFailedLater'))
    }
  }

  const handleCancel = () => {
    navigate('/')
  }

  return {
    handleSave,
    handleCancel
  }
}
