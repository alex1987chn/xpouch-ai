import { useCallback, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useChatStore, type Message } from '@/store/chatStore'
import { useCanvasStore, type ExpertResult } from '@/store/canvasStore'
import { sendMessage, type ApiMessage } from '@/services/api'
import { getSystemAgent } from '@/constants/systemAgents'
import { getDefaultModel } from '@/utils/config'
import { generateId } from '@/utils/storage' // 仅保留 generateId，移除 LocalStorage 相关引用
import type { AgentType } from '@/types'

export function useChat() {
  const navigate = useNavigate()
  const [activeExpertId, setActiveExpertId] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const { setArtifact, addExpertResult, updateExpertResult } = useCanvasStore()

  const {
    messages,
    addMessage,
    updateMessage,
    isTyping,
    setIsTyping,
    inputMessage,
    setInputMessage,
    selectedAgentId,
    currentConversationId,
    setCurrentConversationId,
    getCurrentAgent
  } = useChatStore()

  // 判断智能体类型（系统 vs 自定义）
  const getAgentType = useCallback((agentId: string): AgentType => {
    // 检查是否为系统智能体（以 sys- 开头）
    if (agentId.startsWith('sys-')) {
      return 'system'
    } else if (getSystemAgent(agentId)) {
      return 'system'
    }
    return 'custom'
  }, [])

  // 生成 Thread ID（根据智能体类型）
  const getThreadId = useCallback((agentId: string, userId?: string): string => {
    const agentType = getAgentType(agentId)

    if (agentType === 'system') {
      // 系统智能体：使用 ${userId}_${agentId}
      const clientId = localStorage.getItem('xpouch_client_id') || 'default-user'
      // 提取语义化的 graphId（移除 sys- 前缀）
      const graphId = agentId.replace('sys-', '')
      return `exp_${clientId}_${graphId}`
    } else {
      // 自定义智能体：使用 cus_${agentId}
      return `cus_${agentId}`
    }
  }, [getAgentType])

  // 发送消息核心逻辑
  const handleSendMessage = useCallback(async (content?: string) => {
    const userContent = content || inputMessage
    if (!userContent.trim()) return

    if (!selectedAgentId) {
      console.error('[useChat] 未选择智能体')
      return
    }

    console.log('[useChat] handleSendMessage called:', { userContent, currentConversationId, selectedAgentId })

    // 1. 添加用户消息
    addMessage({ role: 'user', content: userContent })
    setInputMessage('')
    setIsTyping(true)

    // 创建新的 AbortController
    abortControllerRef.current = new AbortController()

    try {
      // 2. 准备请求数据 - 使用当前消息状态 + 用户消息
      const currentMessages = useChatStore.getState().messages
      const chatMessages: ApiMessage[] = currentMessages
        .filter((m: Message) => m.role === 'user' || m.role === 'assistant')
        .map((m: Message) => ({
          role: m.role,
          content: m.content
        }))

      // 判断智能体类型和生成 Thread ID
      const agentType = getAgentType(selectedAgentId)
      const threadId = getThreadId(selectedAgentId)

      console.log('[useChat] Agent Info:', { agentType, agentId: selectedAgentId, threadId })

      // 3. 预先添加 AI 空消息（占位）
      const assistantMessageId = generateId()
      addMessage({
        id: assistantMessageId,
        role: 'assistant',
        content: ''
      })

      let newConversationId: string | undefined

      // 4. 发送请求并处理流式响应
      console.log('[useChat] 准备调用 sendMessage')
      await sendMessage(
        chatMessages,
        selectedAgentId,
        (chunk, conversationId, expertEvent, artifact) => {
          console.log('[useChat] sendMessage 回调被调用:', {
            chunk: chunk?.substring(0, 50),
            conversationId,
            expertEvent,
            hasArtifact: !!artifact,
            assistantMessageId
          })

          // 处理专家事件
          if (expertEvent?.type === 'expert_activated') {
            console.log('[useChat] ✅ 专家激活:', expertEvent.expertId)
            setActiveExpertId(expertEvent.expertId)

            // 添加专家结果到状态栏
            const expertNames: Record<string, string> = {
              search: '搜索专家',
              coder: '编程专家',
              researcher: '研究专家',
              analyzer: '分析专家',
              writer: '写作专家',
              planner: '规划专家',
              image_analyzer: '图片分析专家'
            }

            const newExpert = {
              expertType: expertEvent.expertId,
              expertName: expertNames[expertEvent.expertId] || expertEvent.expertId,
              description: `执行 ${expertNames[expertEvent.expertId] || expertEvent.expertId} 任务`,
              status: 'running' as const,
              startedAt: new Date().toISOString()
            }
            console.log('[useChat] 添加专家到状态栏:', newExpert)
            addExpertResult(newExpert)
            console.log('[useChat] 当前专家结果列表:', useCanvasStore.getState().expertResults)
          } else if (expertEvent?.type === 'expert_completed') {
            console.log('[useChat] ✅ 专家完成:', expertEvent.expertId, expertEvent)
            console.log('[useChat] 更新前专家结果列表:', useCanvasStore.getState().expertResults)
            // 延迟更新专家状态，让用户能看到 running 状态
            setTimeout(() => {
              // 更新专家状态为完成，包含完整信息
              updateExpertResult(expertEvent.expertId, {
                status: (expertEvent.status === 'failed' ? 'failed' : 'completed') as 'completed' | 'failed',
                completedAt: new Date().toISOString(),
                duration: expertEvent.duration_ms,
                error: expertEvent.error,
                output: expertEvent.output
              })
              console.log('[useChat] 更新后专家结果列表:', useCanvasStore.getState().expertResults)
            }, 500) // 延迟 500ms
          }

          // 处理 artifact 事件
          if (artifact) {
            console.log('[useChat] 收到 artifact:', artifact.type)
            console.log('[useChat] Artifact language:', artifact.language)
            console.log('[useChat] Artifact content length:', artifact.content?.length || 0)
            console.log('[useChat] Artifact content preview:', artifact.content?.substring(0, 100))
            // 更新 Canvas 显示代码
            setArtifact(artifact.type, artifact.content)

            // 如果有当前激活的专家，更新其 artifact 信息
            if (activeExpertId) {
              updateExpertResult(activeExpertId, {
                artifact: {
                  type: artifact.type,
                  content: artifact.content,
                  language: artifact.language
                }
              })
            }
          }

          // 实时更新 assistant 消息
          if (chunk) {
            console.log('[useChat] 更新消息:', assistantMessageId, 'chunk length:', chunk.length, 'chunk:', chunk.substring(0, 50))
            updateMessage(assistantMessageId, chunk, true)
          }

          // 如果后端返回了新的 conversationId，保存它
          if (conversationId && !newConversationId) {
            console.log('[useChat] Received conversationId from backend:', conversationId)
            newConversationId = conversationId
          }
        },
        currentConversationId,
        abortControllerRef.current.signal
      )

      // 5. 更新会话状态和 URL
      // 如果是新会话，后端会创建 ID 并通过流式返回（或我们需要手动更新状态）
      if (newConversationId && !currentConversationId) {
        console.log('[useChat] Updating conversation ID and URL:', newConversationId)
        // 使用 replace: true 替换当前的历史记录
        // 注意：这里 navigate 需要在组件中调用，hook 中使用的 navigate 是有效的
        // 但如果这时组件已经卸载了怎么办？（通常不会，因为我们在 ChatPage）
        setCurrentConversationId(newConversationId)
        navigate(`/chat/${newConversationId}`, { replace: true })
      }

    } catch (error) {
      // 检查是否是用户手动取消
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('[useChat] 请求已取消')
        // 移除空的 AI 消息（如果没有内容）
        updateMessage(assistantMessageId, '', false)
      } else {
        console.error('Failed to send message:', error)
        addMessage({
          role: 'assistant',
          content: '抱歉，发生了错误。请检查网络连接或稍后重试。'
        })
      }
    } finally {
      setIsTyping(false)
      abortControllerRef.current = null
    }
  }, [inputMessage, messages, selectedAgentId, currentConversationId, getCurrentAgent, addMessage, setInputMessage, setIsTyping, updateMessage, setCurrentConversationId, navigate, getAgentType, getThreadId])

  // 停止生成
  const handleStopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      console.log('[useChat] 停止生成')
      abortControllerRef.current.abort()
    }
  }, [])

  return {
    messages,
    isTyping,
    inputMessage,
    setInputMessage,
    handleSendMessage,
    handleStopGeneration,
    activeExpertId,
    setActiveExpertId
  }
}
