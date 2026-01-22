import { useCallback, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useChatStore, type Message } from '@/store/chatStore'
import { useCanvasStore, type ExpertResult } from '@/store/canvasStore'
import { sendMessage, type ApiMessage } from '@/services/api'
import { getSystemAgent, createExpertResult } from '@/constants/systemAgents'
import { getDefaultModel } from '@/utils/config'
import { generateId } from '@/utils/storage'
import type { AgentType } from '@/types'
import { getClientId } from '@/services/api'
import { logger, errorHandler } from '@/utils/logger'
import type { Artifact } from '@/types'

// 开发环境判断
const DEBUG = false

// 统一的调试日志函数
const debug = DEBUG
  ? (...args: unknown[]) => console.log('[useChat]', ...args)
  : () => {}

/**
 * 聊天 Hook
 *
 * @description
 * 管理聊天消息、专家激活、SSE 流式响应的核心 Hook
 * 提供发送消息、取消消息、专家状态管理等功能
 *
 * @returns {
 *   sendMessage: 发送消息函数
 *   cancelMessage: 取消消息函数
 *   activeExpertId: 当前激活的专家 ID
 * }
 *
 * @example
 * ```typescript
 * const { sendMessage, cancelMessage, activeExpertId } = useChat()
 * await sendMessage('你好，帮我搜索信息')
 * cancelMessage() // 取消正在发送的消息
 * console.log(activeExpertId) // 'search'
 * ```
 */
export function useChat() {
  const navigate = useNavigate()
  const [activeExpertId, setActiveExpertId] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const { setArtifact, addExpertResult, updateExpertResult, addArtifact, addArtifactsBatch, selectExpert, selectArtifactSession, artifactSessions } = useCanvasStore()

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
      const clientId = getClientId()
      // 提取语义化的 graphId（移除 sys- 前缀）
      const graphId = agentId.replace('sys-', '')
      return `exp_${clientId}_${graphId}`
    } else {
      // 自定义智能体：使用 cus_${agentId}
      return `cus_${agentId}`
    }
  }, [getAgentType])

  // 判断对话模式（根据 agentId）
  const getConversationMode = useCallback((agentId: string): 'simple' | 'complex' => {
    if (agentId === 'sys-assistant') {
      return 'simple'
    }
    // 其他所有情况都是复杂模式（包括 sys-commander 和专家）
    return 'complex'
  }, [])

  // 发送消息核心逻辑
  const handleSendMessage = useCallback(async (content?: string) => {
    const userContent = content || inputMessage
    if (!userContent.trim()) return

    if (!selectedAgentId) {
      console.error('[useChat] 未选择智能体')
      return
    }

    debug('handleSendMessage called:', { userContent, currentConversationId, selectedAgentId })

    // 创建新的 AbortController
    abortControllerRef.current = new AbortController()

    try {
      // 1. 准备请求数据 - 使用 messages 依赖，手动添加用户消息
      const chatMessages: ApiMessage[] = [
        ...messages,
        { role: 'user', content: userContent }
      ]
        .filter((m: any) => m.role === 'user' || m.role === 'assistant')
        .map((m: any) => ({
          role: m.role,
          content: m.content
        }))

      // 2. 添加用户消息（触发状态更新）
      addMessage({ role: 'user', content: userContent })
      setInputMessage('')
      setIsTyping(true)

      // 3. 判断智能体类型、模式和 Thread ID
      const agentType = getAgentType(selectedAgentId)
      const threadId = getThreadId(selectedAgentId)
      const conversationMode = getConversationMode(selectedAgentId)

      debug('Agent Info:', {
        agentType,
        agentId: selectedAgentId,
        threadId,
        conversationMode
      })

      // 4. 在复杂模式下，添加任务开始消息，并预先添加 AI 空消息用于显示最终响应
      let assistantMessageId: string | undefined
      if (conversationMode === 'complex') {
        addMessage({
          id: generateId(),
          role: 'system',
          content: '🔍 检测到是复杂任务，正在拆解任务...'
        })
        // 预先添加 AI 空消息（占位），用于显示聚合器的最终响应
        assistantMessageId = generateId()
        addMessage({
          id: assistantMessageId,
          role: 'assistant',
          content: ''
        })
      } else {
        // 预先添加 AI 空消息（占位）
        assistantMessageId = generateId()
        addMessage({
          id: assistantMessageId,
          role: 'assistant',
          content: ''
        })
      }

      let newConversationId: string | undefined
      let finalResponseContent = ''

      // 5. 发送请求并处理流式响应
      debug('准备调用 sendMessage')
      finalResponseContent = await sendMessage(
        chatMessages,
        selectedAgentId,
        async (chunk, conversationId, expertEvent, artifact, expertId) => {
          debug('sendMessage 回调被调用:', {
            chunk: chunk?.substring(0, 50),
            conversationId,
            expertEvent,
            hasArtifact: !!artifact,
            expertId,
            assistantMessageId
          })

          // 处理任务计划事件（只在复杂模式下）
          if (conversationMode === 'complex' && expertEvent?.type === 'task_plan') {
            const plan = expertEvent as any
            const strategy = plan.strategy
            const estimatedSteps = plan.estimated_steps
            const tasks = plan.tasks || []

            // 构建任务计划消息
            let planMessage = `📋 任务计划\n**执行策略**: ${strategy}\n**预计步骤**: ${estimatedSteps}\n\n---\n`

            tasks.forEach((task: any, index: number) => {
              planMessage += `[${index + 1}] ${task.expert_type}: ${task.description}\n`
            })

            addMessage({
              id: generateId(),
              role: 'system',
              content: planMessage
            })
          }

          // 处理任务开始事件（只在复杂模式下）
          if (conversationMode === 'complex' && expertEvent?.type === 'task_start') {
            const taskInfo = expertEvent as any
            const taskIndex = taskInfo.task_index
            const totalTasks = taskInfo.total_tasks
            const expertType = taskInfo.expert_type
            const description = taskInfo.description

            // 构建任务开始消息
            let taskStartMessage = `🚀 正在执行 [${taskIndex}/${totalTasks}] - ${expertType} 专家\n**任务**: ${description}`

            addMessage({
              id: generateId(),
              role: 'system',
              content: taskStartMessage
            })
          }

          // 处理专家事件（只在复杂模式下）
          if (conversationMode === 'complex') {
            debug('收到专家事件:', expertEvent)
            debug('完整 expertEvent 数据:', JSON.stringify(expertEvent, null, 2))

            // 处理专家激活事件
            if (expertEvent?.type === 'expert_activated') {
              debug('✅ 专家激活:', expertEvent.expertId)
              setActiveExpertId(expertEvent.expertId)
              // 不再添加单独的激活消息，因为任务开始事件已经展示了
              // 使用统一的专家结果创建函数
              const newExpert = createExpertResult(expertEvent.expertId, 'running')
              debug('添加专家到状态栏:', newExpert)
              addExpertResult(newExpert)
              debug('添加后专家结果列表:', useCanvasStore.getState().expertResults)
            } else if (expertEvent?.type === 'expert_completed') {
              debug('✅ 专家完成:', expertEvent.expertId, expertEvent)
              debug('更新前专家结果列表:', useCanvasStore.getState().expertResults)

              // 使用 await Promise.resolve() 替代 setTimeout，让用户能看到 running 状态
              await Promise.resolve()

              // 添加工作流状态消息（包含专家输出）
              const expertConfig = getSystemAgent(expertEvent.expertId)
              const expertName = expertConfig?.name || expertEvent.expertId
              const status = expertEvent.status === 'failed' ? '❌' : '✅'
              const duration = expertEvent.duration_ms ? ` (用时 ${(expertEvent.duration_ms / 1000).toFixed(1)}秒)` : ''

              // 显示专家的输出内容（如果有）
              let completionMessage = `${status} ${expertName} 完成${duration}`
              if (expertEvent.output && expertEvent.output.trim()) {
                completionMessage += `\n\n📄 **输出内容**:\n${expertEvent.output}`
              }

              addMessage({
                id: generateId(),
                role: 'system',
                content: completionMessage
              })

              // 处理 allArtifacts（新架构：批量添加到 ArtifactSession）
              if (expertEvent.allArtifacts && Array.isArray(expertEvent.allArtifacts) && expertEvent.allArtifacts.length > 0) {
                debug('处理 allArtifacts:', expertEvent.allArtifacts.length, '个 artifact')
                debug('专家ID:', expertEvent.expertId)
                debug('artifacts 数据:', expertEvent.allArtifacts)

                const artifacts: Artifact[] = expertEvent.allArtifacts.map((item: any) => ({
                  id: generateId(),
                  timestamp: new Date().toISOString(),
                  type: item.type,
                  title: item.title,
                  content: item.content,
                  language: item.language
                }))

                addArtifactsBatch(expertEvent.expertId, artifacts)
                debug('已添加 artifacts 到 ArtifactSession:', expertEvent.expertId)
              }

              // 更新专家状态为完成，包含完整信息
              updateExpertResult(expertEvent.expertId, {
                status: (expertEvent.status === 'failed' ? 'failed' : 'completed') as 'completed' | 'failed',
                completedAt: new Date().toISOString(),
                duration: expertEvent.duration_ms,
                error: expertEvent.error,
                output: expertEvent.output,
                artifacts: expertEvent.allArtifacts ? expertEvent.allArtifacts.map((item: any) => ({
                  id: generateId(),
                  timestamp: new Date().toISOString(),
                  type: item.type,
                  title: item.title,
                  content: item.content,
                  language: item.language
                })) : undefined
              })
              debug('更新后专家结果列表:', useCanvasStore.getState().expertResults)

              // 检查是否所有专家都已完成，如果是则自动高亮第一个专家
              const expertResults = useCanvasStore.getState().expertResults
              const allCompleted = expertResults.every(expert =>
                expert.status === 'completed' || expert.status === 'failed'
              )

              if (allCompleted && expertResults.length > 0) {
                debug('✅ 所有专家已完成，自动高亮第一个专家')
                const firstExpert = expertResults[0]
                selectExpert(firstExpert.expertType)
                selectArtifactSession(firstExpert.expertType)

                // 添加完成提示消息
                addMessage({
                  id: generateId(),
                  role: 'system',
                  content: `🎉 所有专家已完成！已为您展示 ${expertConfig?.name || firstExpert.expertType} 的交付物`
                })
              }
            }
          }

          // 处理 artifact 事件
          if (artifact && expertId) {
            debug('收到 artifact:', artifact.type, 'expertId:', expertId)
            debug('Artifact language:', artifact.language)
            debug('Artifact content length:', artifact.content?.length || 0)
            debug('Artifact content preview:', artifact.content?.substring(0, 100))

            // 新架构：添加到 ArtifactSession
            const fullArtifact: Artifact = {
              id: generateId(),
              timestamp: new Date().toISOString(),
              type: artifact.type,
              title: artifact.title,
              content: artifact.content,
              language: artifact.language
            }
            addArtifact(expertId, fullArtifact)
            debug('已添加 artifact 到 ArtifactSession:', expertId, 'type:', artifact.type)

            // 自动选中该专家的 session（在简单模式下）
            if (conversationMode === 'simple') {
              selectArtifactSession(expertId)
              debug('简单模式下自动选中 artifact session:', expertId)
            }

            // 兼容旧逻辑：更新 Canvas 显示代码
            setArtifact(artifact.type, artifact.content)

            // 如果有当前激活的专家，更新其 artifact 信息
            if (activeExpertId) {
              updateExpertResult(activeExpertId, {
                artifact: fullArtifact
              })
            }
          }

          // 实时更新 assistant 消息（只在简单模式下）
          if (chunk && conversationMode === 'simple') {
            debug('更新消息:', assistantMessageId, 'chunk length:', chunk.length, 'chunk:', chunk.substring(0, 50))
            updateMessage(assistantMessageId, chunk, true)
          }

          // 如果后端返回了新的 conversationId，保存它
          if (conversationId && !newConversationId) {
            debug('Received conversationId from backend:', conversationId)
            newConversationId = conversationId
          }
        },
        currentConversationId,
        abortControllerRef.current.signal,
        conversationMode  // 传递模式参数
      )

      // 5. 更新会话状态和 URL，并显示最终响应（如果是复杂模式）
      // 如果是新会话，后端会创建 ID 并通过流式返回（或我们需要手动更新状态）
      if (newConversationId && !currentConversationId) {
        debug('Updating conversation ID and URL:', newConversationId)
        // 使用 replace: true 替换当前的历史记录
        // 注意：这里 navigate 需要在组件中调用，hook 中使用的 navigate 是有效的
        // 但如果这时组件已经卸载了怎么办？（通常不会，因为我们在 ChatPage）
        setCurrentConversationId(newConversationId)
        navigate(`/chat/${newConversationId}`, { replace: true })
      }

      // 如果是复杂模式，更新最终响应到助手消息
      if (conversationMode === 'complex' && finalResponseContent && assistantMessageId) {
        debug('更新复杂模式的最终响应，长度:', finalResponseContent.length)
        updateMessage(assistantMessageId, finalResponseContent)
      }

    } catch (error) {
      // 检查是否是用户手动取消
      if (error instanceof Error && error.name === 'AbortError') {
        debug('请求已取消')
        // 移除空的 AI 消息（如果没有内容，只在简单模式下）
        if (conversationMode === 'simple' && assistantMessageId) {
          updateMessage(assistantMessageId, '', false)
        }
      } else {
        // 使用统一的错误处理器
        errorHandler.handle(error, 'handleSendMessage')

        // 添加错误消息到聊天
        const userMessage = errorHandler.getUserMessage(error)
        addMessage({
          role: 'assistant',
          content: userMessage
        })
      }
    } finally {
      setIsTyping(false)
      abortControllerRef.current = null
    }
  }, [inputMessage, selectedAgentId, currentConversationId, getAgentType, getThreadId, getConversationMode])

  // 停止生成
  const handleStopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      debug('停止生成')
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
