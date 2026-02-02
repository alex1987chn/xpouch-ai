/**
 * 聊天相关 API 服务
 * v3.0: 只支持新的事件协议
 */

import { fetchEventSource, EventSourceMessage } from '@microsoft/fetch-event-source'
import { getHeaders, buildUrl, handleResponse } from './common'
import { ApiMessage, StreamCallback, Conversation } from '@/types'
import { logger } from '@/utils/logger'
import { handleServerEvent } from '@/handlers/eventHandlers'
import { useTaskStore } from '@/store/taskStore'

// ============================================================================
// API 函数
// ============================================================================

/**
 * 获取会话列表
 */
export async function getConversations(): Promise<Conversation[]> {
  const response = await fetch(buildUrl('/threads'), {
    headers: getHeaders()
  })
  return handleResponse<Conversation[]>(response, '获取会话列表失败')
}

/**
 * 获取单个会话详情
 */
export async function getConversation(id: string): Promise<Conversation> {
  const response = await fetch(buildUrl(`/threads/${id}`), {
    headers: getHeaders()
  })
  return handleResponse<Conversation>(response, '获取会话详情失败')
}

/**
 * 删除会话
 */
export async function deleteConversation(id: string): Promise<void> {
  const response = await fetch(buildUrl(`/threads/${id}`), {
    method: 'DELETE',
    headers: getHeaders()
  })
  return handleResponse<void>(response, '删除会话失败')
}

/**
 * 发送消息 - 流式输出
 * v3.0: 只处理新协议事件
 */
export async function sendMessage(
  messages: ApiMessage[],
  agentId: string = 'default-chat',
  onChunk?: StreamCallback,
  conversationId?: string | null,
  abortSignal?: AbortSignal,
  assistantMessageId?: string | undefined  // v3.0: 前端传递的助手消息 ID
): Promise<string> {

  const history = messages.slice(0, -1)
  const lastMessage = messages[messages.length - 1]
  const messageContent = lastMessage.content

  const url = buildUrl('/chat')

  if (!onChunk) {
    const response = await fetch(url, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        message: messageContent,
        history: history.map(m => ({ role: m.role, content: m.content })),
        agentId,
        conversationId,
        stream: false,
        message_id: assistantMessageId,  // v3.0: 传递助手消息 ID
      }),
      signal: abortSignal
    })
    return handleResponse<any>(response, '发送消息失败')
  }

  return new Promise((resolve, reject) => {
    let fullContent = ''
    let finalConversationId: string | undefined = conversationId || undefined
    let isCompleted = false

    const ctrl = new AbortController()

    if (abortSignal) {
      abortSignal.addEventListener('abort', () => {
        ctrl.abort()
        reject(new Error('请求已取消'))
      })
    }

    fetchEventSource(url, {
      method: 'POST',
      headers: {
        ...getHeaders(),
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify({
        message: messageContent,
        history: history.map(m => ({ role: m.role, content: m.content })),
        agentId,
        conversationId,
        stream: true,
        message_id: assistantMessageId,  // v3.0: 传递助手消息 ID
      }),
      signal: ctrl.signal,

      async onopen(response) {
        if (!response.ok) {
          logger.error('[chat.ts] SSE 连接失败:', response.status, response.statusText)
          throw new Error(`API Error: ${response.status}`)
        }
        logger.debug('[chat.ts] SSE 连接已打开')
      },

      async onmessage(msg: EventSourceMessage) {
        if (msg.data === '[DONE]') {
          logger.debug('[chat.ts] 收到 [DONE]，流式响应完成')
          isCompleted = true
          ctrl.abort()
          resolve(fullContent)
          return
        }

        try {
          // v3.0: SSE 格式通过 msg.event 获取事件类型
          const eventType = msg.event
          const eventData = JSON.parse(msg.data)
          
          // DEBUG: 记录收到的事件
          if (eventType === 'message.delta' || eventType === 'message.done') {
            logger.debug('[chat.ts] 收到事件:', eventType, 'data:', eventData)
          }
          
          // v3.0: 构建标准事件对象并交给 eventHandlers 处理
          if (eventType) {
            const fullEvent = {
              id: msg.id || crypto.randomUUID(),
              timestamp: new Date().toISOString(),
              type: eventType,
              data: eventData
            }
            
            // 统一处理所有事件
            handleServerEvent(fullEvent as any)
            
            // 对于 message.delta 事件，额外更新 UI 流式内容
            if (eventType === 'message.delta' && onChunk) {
              await onChunk(eventData.content, finalConversationId)
              fullContent += eventData.content
            }
          }
          
        } catch (e) {
          logger.debug('[chat.ts] 解析 SSE 数据失败，跳过:', msg.data.substring(0, 100))
        }
      },

      onerror(err) {
        if (err.name === 'AbortError' || ctrl.signal.aborted) {
          logger.debug('[chat.ts] 请求已取消')
          return
        }
        logger.error('[chat.ts] SSE 错误:', err)
        throw err
      },

      onclose() {
        logger.debug('[chat.ts] SSE 连接已关闭')
        if (!isCompleted) {
          resolve(fullContent)
        }
      },
    })
  })
}
