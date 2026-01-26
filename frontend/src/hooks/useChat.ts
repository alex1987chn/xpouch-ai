import { useCallback, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useChatStore } from '@/store/chatStore'
import { useCanvasStore } from '@/store/canvasStore'
import { sendMessage, type ApiMessage } from '@/services/api'
import { getExpertConfig, createExpertResult } from '@/constants/systemAgents'
import type { Message } from '@/types'
import { errorHandler } from '@/utils/logger'
import type { Artifact } from '@/types'
import { parseAssistantMessage, shouldDisplayAsArtifact } from '@/utils/artifactParser'
import { getAgentType, getThreadId, getConversationMode } from '@/utils/agentUtils'

import { logger } from '@/utils/logger'

// 开发环境判断
const DEBUG = import.meta.env.VITE_DEBUG_MODE === 'true'

// 统一的调试日志函数
const debug = DEBUG
  ? (...args: unknown[]) => logger.debug('[useChat]', ...args)
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
  const { setArtifact, addExpertResult, updateExpertResult, addArtifact, addArtifactsBatch, selectExpert, selectArtifactSession } = useCanvasStore()

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
    setCurrentConversationId
  } = useChatStore()

  // 处理所有类型的事件（任务开始、任务计划、专家激活、专家完成）
  const processExpertEvent = useCallback(async (
    expertEvent: any,
    conversationMode: 'simple' | 'complex',
    assistantMessageId?: string // 未使用，保留为了接口兼容
  ) => {
    if (conversationMode !== 'complex') return

    debug('收到事件:', expertEvent.type, expertEvent)

    // 处理任务开始事件
    if (expertEvent?.type === 'task_start') {
      const taskInfo = expertEvent as any
      const expertType = taskInfo.expert_type
      const description = taskInfo.description

      // 设置当前执行的专家信息（用于loading气泡展示）
      setActiveExpertId(expertType)
      // 更新专家状态为运行中
      const newExpert = createExpertResult(expertType, 'running')
      newExpert.description = description
      updateExpertResult(expertType, newExpert)
      return
    }

    // 处理任务计划事件
    if (expertEvent?.type === 'task_plan') {
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
      return
    }

    // 处理专家激活事件
    if (expertEvent?.type === 'expert_activated') {
      debug('✅ 专家激活:', expertEvent.expertId)
      setActiveExpertId(expertEvent.expertId)
      // 使用统一的专家结果创建函数
      const newExpert = createExpertResult(expertEvent.expertId, 'running')
      debug('添加专家到状态栏:', newExpert)
      addExpertResult(newExpert)
      debug('添加后专家结果列表:', useCanvasStore.getState().expertResults)
      return
    }

    // 处理专家完成事件
    if (expertEvent?.type === 'expert_completed') {
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
        debug('✅ 所有专家已完成，自动高亮第一个专家')
        const firstExpert = expertResults[0]
        selectExpert(firstExpert.expertType)
        selectArtifactSession(firstExpert.expertType)
      }
    }
  }, [setActiveExpertId, addExpertResult, updateExpertResult, addMessage, selectExpert, selectArtifactSession])

  // 发送消息核心逻辑
  const handleSendMessage = useCallback(async (content?: string, overrideAgentId?: string) => {
    const userContent = content || inputMessage
    if (!userContent.trim()) return

    // 优先使用传入的 agentId，否则使用 store 中的 selectedAgentId
    const agentId = overrideAgentId || selectedAgentId
    if (!agentId) {
      logger.error('[useChat] 未选择智能体')
      return
    }

    const conversationMode = getConversationMode(agentId)
    debug('handleSendMessage called:', { userContent, currentConversationId, agentId, overrideAgentId })

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
      const agentType = getAgentType(agentId)
      const threadId = getThreadId(agentId)

      debug('Agent Info:', {
        agentType,
        agentId: agentId,
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
        agentId,
        async (chunk: string | undefined, conversationId?: string, expertEvent?: any, artifact?: Artifact, expertId?: string) => {
          // 修复：更新store中的conversationId为后端返回的真实ID
          if (conversationId && conversationId !== actualConversationId) {
            actualConversationId = conversationId
            setCurrentConversationId(conversationId)
          }

          // 处理所有类型的事件（任务开始、任务计划、专家事件）
          if (expertEvent && conversationMode === 'complex') {
            await processExpertEvent(expertEvent, conversationMode, assistantMessageId)
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

            // 在简单模式下，也自动选中该专家的 session，以便在artifact区域查看
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
          if (chunk && conversationMode === 'simple' && assistantMessageId) {
            debug('更新消息:', assistantMessageId, 'chunk length:', chunk.length, 'chunk:', chunk.substring(0, 50))
            // 直接使用updateMessage的append功能，不要手动累积
            updateMessage(assistantMessageId, chunk, true)
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

      // 更新最终响应到助手消息（简单模式和复杂模式都需要）
      // 确保消息更新在artifact创建之前完成，避免状态不一致
      if (finalResponseContent && assistantMessageId) {
        debug(`更新助手消息 ${assistantMessageId}，长度: ${finalResponseContent.length}，模式: ${conversationMode}`)
        // updateMessage是同步的，不要await，避免页面卡死
        updateMessage(assistantMessageId!, finalResponseContent)
      }

      // 6. 自动从助手消息中提取内容并创建 artifact
      if (finalResponseContent && shouldDisplayAsArtifact(finalResponseContent)) {
        // 确定 expertType（专家类型）
        let expertType = 'assistant'
        if (conversationMode === 'complex') {
          // 复杂模式下，使用当前激活的专家或默认值
          expertType = activeExpertId || 'commander'
        } else {
          // 简单模式下，使用 'simple' 作为专家类型
          expertType = 'simple'
        }
        
        // 解析助手消息内容
        const artifacts = parseAssistantMessage(finalResponseContent, expertType)
        
        if (artifacts.length > 0) {
          debug(`成功解析出 ${artifacts.length} 个 artifact，expertType: ${expertType}`)
          
          // 转换为完整的 Artifact 对象
          const fullArtifacts: Artifact[] = artifacts.map(art => ({
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            ...art
          }))
          
          // 在简单模式下，立即创建artifact（不再延迟）
          // 消息更新已经完成，UI会自然刷新
          addArtifactsBatch(expertType, fullArtifacts)
          if (conversationMode === 'simple') {
            selectArtifactSession(expertType)
            debug(`简单模式创建 ${fullArtifacts.length} 个 artifacts`)
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
  }, [inputMessage, selectedAgentId, currentConversationId])

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
