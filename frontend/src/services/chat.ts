/**
 * 聊天相关 API 服务
 */

import { getHeaders, buildUrl, handleResponse } from './common'
import { ApiMessage, StreamCallback, ExpertEvent, Artifact, Conversation } from '@/types'
import { logger } from '@/utils/logger'

// ============================================================================
// API 函数
// ============================================================================

/**
 * 获取会话列表
 */
export async function getConversations(): Promise<Conversation[]> {
  const response = await fetch(buildUrl('/conversations'), {
    headers: getHeaders()
  })
  return handleResponse<Conversation[]>(response, '获取会话列表失败')
}

/**
 * 获取单个会话详情
 */
export async function getConversation(id: string): Promise<Conversation> {
  const response = await fetch(buildUrl(`/conversations/${id}`), {
    headers: getHeaders()
  })
  return handleResponse<Conversation>(response, '获取会话详情失败')
}

/**
 * 删除会话
 */
export async function deleteConversation(id: string): Promise<void> {
  const response = await fetch(buildUrl(`/conversations/${id}`), {
    method: 'DELETE',
    headers: getHeaders()
  })
  return handleResponse<void>(response, '删除会话失败')
}

/**
 * 发送消息 - 流式输出
 */
export async function sendMessage(
  messages: ApiMessage[],
  agentId: string = 'default-chat',
  onChunk?: StreamCallback,
  conversationId?: string | null,
  abortSignal?: AbortSignal
): Promise<string> {

  // 提取最新一条消息作为当前 prompt，其他的作为 history
  const history = messages.slice(0, -1)
  const lastMessage = messages[messages.length - 1]
  const messageContent = lastMessage.content

  const url = buildUrl('/chat')

  if (!onChunk) {
    // 非流式模式
    const response = await fetch(url, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        message: messageContent,
        history: history.map(m => ({ role: m.role, content: m.content })),
        agentId,
        conversationId,
        stream: false,
      }),
      signal: abortSignal
    })
    return handleResponse<any>(response, '发送消息失败')
  }

  // 流式模式
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        message: messageContent,
        history: history.map(m => ({ role: m.role, content: m.content })),
        agentId,
        conversationId,
        stream: true,
      }),
      signal: abortSignal
    })

    if (!response.ok) {
      logger.error('[chat.ts] 请求失败:', response.status, response.statusText)
      throw new Error(`API Error: ${response.status}`)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('Response body is not readable')
    }

    return await processStream(reader, onChunk, conversationId)
  } catch (error) {
    logger.error('[chat.ts] 流式请求失败:', error)
    throw error
  }
}

/**
 * 处理 SSE 流式响应
 */
async function processStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onChunk: StreamCallback,
  initialConversationId?: string | null
): Promise<string> {
  const decoder = new TextDecoder()
  let fullContent = ''
  let buffer = ''
  let finalConversationId: string | undefined = initialConversationId || undefined

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value, { stream: true })
      buffer += chunk
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue

        if (trimmed.startsWith('data: ')) {
          const data = trimmed.slice(6)
          if (data === '[DONE]') continue

          try {
            const parsed = JSON.parse(data)
            await processSSEData(parsed, onChunk, finalConversationId)
              .then(conversationId => {
                if (conversationId) {
                  finalConversationId = conversationId
                }
              })
          } catch (e) {
            // Failed to parse SSE data, skip
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }

  return fullContent
}

/**
 * 处理 SSE 数据包
 */
async function processSSEData(
  data: any,
  onChunk: StreamCallback,
  conversationId?: string
): Promise<string | undefined> {
  const content = data.content
  const activeExpert = data.activeExpert
  const expertCompleted = data.expertCompleted
  const artifact = data.artifact
  const allArtifacts = data.allArtifacts as Array<any> | undefined
  const taskPlan = data.taskPlan
  const taskStart = data.taskStart

  let finalConversationId = data.conversationId || conversationId

  // 处理专家激活事件
  if (activeExpert) {
    await onChunk(undefined, finalConversationId, {
      type: 'expert_activated',
      expertId: activeExpert,
      description: data.description
    })
  }

  // 处理专家完成事件
  if (expertCompleted) {
    await onChunk(undefined, finalConversationId, {
      type: 'expert_completed',
      expertId: expertCompleted,
      status: data.status || 'completed',
      duration_ms: data.duration_ms,
      description: data.description,
      error: data.error,
      output: data.output,
      allArtifacts: allArtifacts || []
    })
  }

  // 处理任务计划事件
  if (taskPlan) {
    await onChunk(undefined, finalConversationId, {
      type: 'task_plan',
      tasks: taskPlan.tasks || []
    })
  }

  // 处理任务开始事件
  if (taskStart) {
    await onChunk(undefined, finalConversationId, {
      type: 'task_start',
      expert_type: taskStart.expert_type,
      description: taskStart.description,
      task_name: taskStart.task_name
    })
  }

  // 处理 artifact 事件
  if (artifact && activeExpert) {
    const fullArtifact: Artifact = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      type: artifact.type,
      title: artifact.title,
      content: artifact.content,
      language: artifact.language
    }
    await onChunk(undefined, finalConversationId, undefined, fullArtifact, activeExpert)
  }

  // 处理内容
  if (content) {
    await onChunk(content, finalConversationId)
  }

  return finalConversationId
}
