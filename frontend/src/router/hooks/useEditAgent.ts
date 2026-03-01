/**
 * 编辑智能体业务逻辑 Hook
 */

import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useChatStore } from '@/store/chatStore'
import { useUserStore } from '@/store/userStore'
import { getAllAgents, updateCustomAgent } from '@/services/api'
import { logger } from '@/utils/logger'
import { useTranslation } from '@/i18n'
import { agentsKeys } from '@/hooks/queries'
import type { AgentDisplay } from '@/services/agent'

export interface AgentEditData {
  id: string
  name: string
  description: string
  systemPrompt: string
  category: string
  modelId: string
}

export function useEditAgent() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const setCustomAgents = useChatStore(state => state.setCustomAgents)
  const isAuthenticated = useUserStore(state => state.isAuthenticated)
  const { t } = useTranslation()

  const [agentData, setAgentData] = useState<AgentEditData | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // 加载智能体数据
  useEffect(() => {
    // 未登录时重定向到首页
    if (!isAuthenticated) {
      navigate('/')
      return
    }

    const loadAgent = async () => {
      if (!id) {
        navigate('/')
        return
      }

      try {
        const agents = await getAllAgents()
        const agent = agents.find((a: AgentDisplay) => a.id === id)

        if (!agent) {
          logger.error('智能体不存在:', id)
          navigate('/')
          return
        }

        setAgentData({
          id: agent.id,
          name: agent.name,
          description: agent.description || '',
          systemPrompt: agent.system_prompt || '',
          category: agent.category || t('general'),
          modelId: agent.model_id || 'deepseek-chat'
        })
      } catch (error) {
        logger.error('加载智能体失败:', error)
        navigate('/')
      } finally {
        setIsLoading(false)
      }
    }

    loadAgent()
  }, [id, navigate, isAuthenticated, t])

  const handleSave = async (agent: AgentEditData): Promise<void> => {
    if (!id) return

    try {
      const updatedAgent = await updateCustomAgent(id, {
        name: agent.name,
        description: agent.description,
        systemPrompt: agent.systemPrompt,
        category: agent.category,
        modelId: agent.modelId
      })

      // 更新本地状态
      setCustomAgents(prev =>
        prev.map(a =>
          a.id === id
            ? { ...a, ...updatedAgent }
            : a
        )
      )

      // 🔥 使用 React Query 缓存失效
      queryClient.invalidateQueries({ queryKey: agentsKeys.lists() })

      // 导航回首页
      navigate('/', { state: { agentTab: 'my' } })
    } catch (error) {
      logger.error('更新智能体失败:', error)
      alert(t('updateFailedLater'))
    }
  }

  const handleCancel = () => {
    navigate('/')
  }

  return {
    id,
    agentData,
    isLoading,
    handleSave,
    handleCancel
  }
}
