import { useCallback, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useChatStore, type Message } from '@/store/chatStore'
import { useCanvasStore, type ExpertResult } from '@/store/canvasStore'
import { sendMessage, type ApiMessage } from '@/services/api'
import { getExpertConfig, createExpertResult } from '@/constants/systemAgents'
import { getDefaultModel } from '@/utils/config'
import type { AgentType } from '@/types'
import { getClientId } from '@/services/api'
import { logger, errorHandler } from '@/utils/logger'
import type { Artifact } from '@/types'
import { parseAssistantMessage, shouldDisplayAsArtifact } from '@/utils/artifactParser'
import { SYSTEM_AGENTS, isSystemAgent } from '@/constants/agents'

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

  // 判断智能体类型（默认助手 / AI助手 / 自定义）
  const getAgentType = useCallback((agentId: string): AgentType => {
    if (isSystemAgent(agentId)) {
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
  // sys-task-orchestrator 是复杂模式，其他都是简单模式
  const getConversationMode = useCallback((agentId: string): 'simple' | 'complex' => {
    if (agentId === SYSTEM_AGENTS.ORCHESTRATOR) {
      return 'complex'
    }
    return 'simple'
  }, [])

  // 发送消息核心逻辑
  const handleSendMessage = useCallback(async (content?: string) => {
    const userContent = content || inputMessage
    if (!userContent.trim()) return

    if (!selectedAgentId) {
      console.error('[useChat] 未选择智能体')
      return
    }

    const conversationMode = getConversationMode(selectedAgentId)
    debug('handleSendMessage called:', { userContent, currentConversationId, selectedAgentId })

    // 创建新的 AbortController
    abortControllerRef.current = new AbortController()

    let assistantMessageId: string | undefined
    
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

      // 4. 判断智能体类型和 Thread ID
      const agentType = getAgentType(selectedAgentId)
      const threadId = getThreadId(selectedAgentId)

      debug('Agent Info:', {
        agentType,
        agentId: selectedAgentId,
        threadId,
        conversationMode
      })

      // 5. 在复杂模式下，添加任务开始消息，并预先添加 AI 空消息用于显示最终响应
      if (conversationMode === 'complex') {
        // 添加复杂模式开始提示
        addMessage({
          id: crypto.randomUUID(),
          role: 'system',
          content: '🔍 检测到复杂任务，正在拆解...'
        })
        // 预先添加 AI 空消息（占位），用于显示聚合器的最终响应
        assistantMessageId = crypto.randomUUID()
        addMessage({
          id: assistantMessageId,
          role: 'assistant',
          content: ''
        })
      } else {
        // 预先添加 AI 空消息（占位）
        assistantMessageId = crypto.randomUUID()
        addMessage({
          id: assistantMessageId,
          role: 'assistant',
          content: ''
        })
      }

      let finalResponseContent = ''

      // 存储后端返回的真实conversationId
      let actualConversationId = currentConversationId

      // 5. 发送请求并处理流式响应
      debug('准备调用 sendMessage')
      finalResponseContent = await sendMessage(
        chatMessages,
        selectedAgentId,
        async (chunk, conversationId, expertEvent, artifact, expertId) => {
          // 修复：更新store中的conversationId为后端返回的真实ID
          if (conversationId && conversationId !== actualConversationId) {
            actualConversationId = conversationId
            setCurrentConversationId(conversationId)
          }

          // 处理任务开始事件（只在复杂模式下）- 不再添加消息，信息在loading气泡中展示
          if (conversationMode === 'complex' && expertEvent?.type === 'task_start') {
            const taskInfo = expertEvent as any
            const expertType = taskInfo.expert_type
            const description = taskInfo.description

            // 设置当前执行的专家信息（用于loading气泡展示）
            setActiveExpertId(expertType)
            // 更新专家状态为运行中
            const newExpert = createExpertResult(expertType, 'running')
            newExpert.description = description
            updateExpertResult(expertType, newExpert)
          }

          // 处理任务计划事件（只在复杂模式下）
          if (conversationMode === 'complex' && expertEvent?.type === 'task_plan') {
            const taskPlan = expertEvent as any
            const tasks = taskPlan.tasks || []
            
            // 构建简单的任务列表消息
            let taskListMessage = '📋 任务计划：\n'
            tasks.forEach((task: any, index: number) => {
              taskListMessage += `${index + 1}. ${task.description}\n`
            })

            addMessage({
              id: crypto.randomUUID(),
              role: 'system',
              content: taskListMessage
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
              const expertConfig = getExpertConfig(expertEvent.expertId)
              const expertName = expertConfig.name
              const duration = expertEvent.duration_ms ? `${(expertEvent.duration_ms / 1000).toFixed(1)}` : ''
              const expertId = expertEvent.expertId
              const description = expertEvent.description || ''

              // 简洁的完成消息，输出内容在 artifact 区域展示
              let completionMessage = `${expertName}专家完成任务【${description}】，用时${duration}秒。交付物在右侧可查看 [查看交付物](#${expertId})`

              // 失败时显示错误信息
              if (expertEvent.status === 'failed') {
                if (expertEvent.error) {
                  completionMessage += `\n\n失败原因：${expertEvent.error}`
                } else {
                  completionMessage += `\n\n任务执行失败，请查看详细错误信息`
                }
              }

              addMessage({
                id: crypto.randomUUID(),
                role: 'system',
                content: completionMessage,
                metadata: {
                  type: 'expert_completion',
                  expertId: expertId
                }
              })

              // 处理 allArtifacts（新架构：批量添加到 ArtifactSession）
              if (expertEvent.allArtifacts && Array.isArray(expertEvent.allArtifacts) && expertEvent.allArtifacts.length > 0) {
                debug('处理 allArtifacts:', expertEvent.allArtifacts.length, '个 artifact')
                debug('专家ID:', expertEvent.expertId)
                debug('artifacts 数据:', expertEvent.allArtifacts)

                const artifacts: Artifact[] = expertEvent.allArtifacts.map((item: any) => ({
                  id: crypto.randomUUID(),
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
                  id: crypto.randomUUID(),
                  timestamp: new Date().toISOString(),
                  type: item.type,
                  title: item.title,
                  content: item.content,
                  language: item.language
                })) : undefined
              })
              debug('更新后专家结果列表:', useCanvasStore.getState().expertResults)

              // 检查是否所有专家都已完成，如果是则显示总完成消息
              const expertResults = useCanvasStore.getState().expertResults
              const allCompleted = expertResults.every(expert =>
                expert.status === 'completed' || expert.status === 'failed'
              )

              // 只有当所有专家都完成，且当前专家是最后一个完成的专家时，才显示总完成消息
              if (allCompleted && expertResults.length > 0) {
                const currentExpertIndex = expertResults.findIndex(e => e.expertType === expertId)
                // 只显示最后一个专家完成时的总完成消息
                if (currentExpertIndex === expertResults.length - 1) {
                  debug('✅ 所有专家已完成，自动高亮第一个专家')
                  const firstExpert = expertResults[0]
                  selectExpert(firstExpert.expertType)
                  selectArtifactSession(firstExpert.expertType)
                }
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
              id: crypto.randomUUID(),
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
            console.log('[useChat] 简单模式收到 chunk:', { assistantMessageId, chunkLength: chunk.length, chunk: chunk.substring(0, 50) })
            debug('更新消息:', assistantMessageId, 'chunk length:', chunk.length, 'chunk:', chunk.substring(0, 50))
            console.log('[useChat] 更新消息前检查 store 状态:', {
              messageIds: useChatStore.getState().messages.map(m => m.id),
              hasAssistantMessage: useChatStore.getState().messages.find(m => m.id === assistantMessageId)
            })
            updateMessage(assistantMessageId, chunk, true)
            console.log('[useChat] 更新消息后检查 store 状态:', {
              messageIds: useChatStore.getState().messages.map(m => m.id),
              assistantMessage: useChatStore.getState().messages.find(m => m.id === assistantMessageId)
            })
          }

          // 注意：处理后端返回的conversationId，确保前端使用正确的会话ID
          // 后端可能返回与前端不同的ID（例如前端生成的UUID格式不符合要求）
        },
        currentConversationId,
        abortControllerRef.current.signal
      )

      // 修复：更新URL中的conversationId为后端返回的真实ID
      if (actualConversationId !== currentConversationId) {
        navigate(`/chat/${actualConversationId}?agentId=${selectedAgentId}`, { replace: true })
      }

      // 如果是复杂模式，更新最终响应到助手消息
      if (conversationMode === 'complex' && finalResponseContent && assistantMessageId) {
        updateMessage(assistantMessageId, finalResponseContent)
      }

      // 6. 自动从助手消息中提取内容并创建 artifact
      if (finalResponseContent && shouldDisplayAsArtifact(finalResponseContent)) {
        // 确定 expertType（专家类型）
        let expertType = 'assistant'
        if (conversationMode === 'complex') {
          // 复杂模式下，使用当前激活的专家或默认值
          expertType = activeExpertId || 'commander'
        }
        
        // 解析助手消息内容
        const artifacts = parseAssistantMessage(finalResponseContent, expertType)
        
        if (artifacts.length > 0) {
          debug(`成功解析出 ${artifacts.length} 个 artifact，expertType: ${expertType}`)
          
          // 批量添加 artifact 到会话中
          addArtifactsBatch(expertType, artifacts)
          
          // 如果是简单模式，自动选中该会话
          if (conversationMode === 'simple') {
            selectArtifactSession(expertType)
          }
        }
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
