/**
 * 聊天 API 服务层
 * 
 * [职责]
 * 封装所有与后端聊天相关的 HTTP API 调用，包括：
 * - 会话管理（CRUD）
 * - 流式消息发送（SSE）
 * - HITL 恢复执行
 * - Artifact 更新
 * 
 * [架构]
 * - 使用 @microsoft/fetch-event-source 处理 SSE 流式响应
 * - 事件分发：将 SSE 事件同时传递给 handleServerEvent（全局处理）和 onChunk 回调（组件级处理）
 * - 自动 Token 刷新：401 时尝试刷新 Token 后重试
 * 
 * [关键函数]
 * - sendMessageStream: 核心流式发送，处理简单/复杂模式
 * - resumeTaskSession: HITL 恢复执行，支持用户修改后的计划
 * - updateArtifact: Artifact 编辑保存
 * 
 * [事件协议]
 * v3.0 新协议事件：
 * - plan.created: 任务计划创建
 * - task.started/completed/failed: 任务状态变更
 * - artifact.generated: 产物生成
 * - message.delta: 流式文本增量
 * - message.done: 消息完成
 * - human.interrupt: HITL 中断等待用户确认
 * 
 * [错误处理]
 * - 网络错误：自动重试一次
 * - 解析错误：跳过无效 SSE 数据，继续处理
 * - 认证错误：触发 Token 刷新或跳转登录
 */

import { fetchEventSource, EventSourceMessage } from '@microsoft/fetch-event-source'
import { getHeaders, buildUrl, handleResponse, handleSSEConnectionError } from './common'
import { ApiMessage, StreamCallback, Conversation } from '@/types'
import { logger } from '@/utils/logger'
import { handleServerEvent } from '@/handlers/eventHandlers'

// 重新导出类型供外部使用（Conversation 类型来自 @/types）
export type { Conversation }
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
  return await handleResponse<Conversation>(response, '获取会话详情失败')
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
        agent_id: agentId,
        conversation_id: conversationId,
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
        agent_id: agentId,
        conversation_id: conversationId,
        stream: true,
        message_id: assistantMessageId,  // v3.0: 传递助手消息 ID
      }),
      signal: ctrl.signal,
      // v3.0: 保持连接即使页面隐藏（防止切换标签页导致任务重新开始）
      openWhenHidden: true,

      async onopen(response) {
        handleSSEConnectionError(response, 'chat.ts')
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
          
          // v3.0: 构建标准事件对象
          if (eventType) {
            const fullEvent = {
              id: msg.id || crypto.randomUUID(),
              timestamp: new Date().toISOString(),
              type: eventType,
              data: eventData
            }
            
            // 🔥 事件分流：Chat 流式 vs Task 批处理 (SDUI 原则)
            // message.* 事件 -> onChunk (给 ChatStore 处理对话流)
            // router/plan/task/artifact 事件 -> handleServerEvent (给 TaskStore 处理任务流)
            const isChatEvent = eventType.startsWith('message.') || eventType === 'error'
            
            if (isChatEvent && onChunk) {
              if (eventType === 'message.delta') {
                // 文本流事件：传递内容
                const rawContent = eventData.content
                if (rawContent && typeof rawContent === 'string') {
                  await onChunk(rawContent, finalConversationId)
                  fullContent += rawContent
                }
              } else if (eventType === 'message.done') {
                // message.done 事件：给 handleServerEvent 处理 thinking 状态更新
                // 注意：onChunk 对 message.done 不处理（chunk 为 undefined）
                handleServerEvent(fullEvent as any)
              } else {
                // error 等其他事件：传递事件对象
                await onChunk(undefined, finalConversationId, fullEvent as any)
              }
            } else if (!isChatEvent) {
              // Task 相关事件：直接给 eventHandlers，不经过 onChunk
              handleServerEvent(fullEvent as any)
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

/**
 * 更新 Artifact 内容（持久化到后端）
 * 用于用户编辑 AI 生成的产物
 */
export interface UpdateArtifactParams {
  artifactId: string
  content: string
}

export interface UpdateArtifactResult {
  id: string
  type: string
  title?: string
  content: string
  language?: string
  sort_order: number
  updated: boolean
}

export async function updateArtifact(
  params: UpdateArtifactParams
): Promise<UpdateArtifactResult> {
  const response = await fetch(buildUrl(`/artifacts/${params.artifactId}`), {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify({ content: params.content })
  })
  return handleResponse<UpdateArtifactResult>(response, '保存失败')
}

/**
 * 🔥🔥🔥 v3.1.0 HITL: 恢复被中断的执行流程
 * 复用与 sendMessage 完全相同的 SSE 处理逻辑
 */
export interface ResumeChatParams {
  threadId: string
  updatedPlan?: Array<{
    id: string
    expert_type: string
    description: string
    sort_order: number
    status: 'pending' | 'running' | 'completed' | 'failed'
    depends_on?: string[] // 🔥 任务依赖关系（关键字段）
  }>
  approved: boolean
}

export async function resumeChat(
  params: ResumeChatParams,
  onChunk?: StreamCallback,
  abortSignal?: AbortSignal
): Promise<string> {
  const url = buildUrl('/chat/resume')
  
  // 如果不需要流式响应（如用户取消），使用普通 fetch
  if (!onChunk) {
    const response = await fetch(url, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        thread_id: params.threadId,
        updated_plan: params.updatedPlan,
        approved: params.approved
      }),
      signal: abortSignal
    })
    return handleResponse<any>(response, '恢复执行失败')
  }

  // 🔥 流式响应：复用与 sendMessage 完全相同的 SSE 处理逻辑
  // 🚨🚨🚨 风险 2 修复：添加超时处理，防止 Promise 无限等待
  return new Promise((resolve, reject) => {
    let fullContent = ''
    let isCompleted = false
    let lastActivityTime = Date.now()
    
    // 🚨 超时检查（120秒无活动视为超时）
    const TIMEOUT_MS = 120000
    const timeoutCheck = setInterval(() => {
      if (isCompleted) {
        clearInterval(timeoutCheck)
        return
      }
      if (Date.now() - lastActivityTime > TIMEOUT_MS) {
        clearInterval(timeoutCheck)
        logger.error('[chat.ts] Resume 超时：120秒内无活动')
        ctrl.abort()
        reject(new Error('执行超时，请检查后端状态'))
      }
    }, 10000)  // 每 10 秒检查一次

    const ctrl = new AbortController()

    if (abortSignal) {
      abortSignal.addEventListener('abort', () => {
        clearInterval(timeoutCheck)
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
        thread_id: params.threadId,
        updated_plan: params.updatedPlan,
        approved: params.approved
      }),
      signal: ctrl.signal,
      openWhenHidden: true,

      async onopen(response) {
        handleSSEConnectionError(response, 'chat.ts resume', () => clearInterval(timeoutCheck))
        lastActivityTime = Date.now()
      },

      async onmessage(msg: EventSourceMessage) {
        lastActivityTime = Date.now()  // 更新活动时间
        
        if (msg.data === '[DONE]') {
          logger.debug('[chat.ts] Resume 收到 [DONE]，流式响应完成')
          isCompleted = true
          clearInterval(timeoutCheck)
          resolve(fullContent)
          return
        }

        try {
          const eventType = msg.event
          const eventData = JSON.parse(msg.data)
          
          if (eventType) {
            const fullEvent = {
              id: msg.id || crypto.randomUUID(),
              timestamp: new Date().toISOString(),
              type: eventType,
              data: eventData
            }
            
            // 🔥 事件分流：Chat 流式 vs Task 批处理
            const isChatEvent = eventType.startsWith('message.') || eventType === 'error'
            
            if (isChatEvent && onChunk) {
              if (eventType === 'message.delta') {
                const content = eventData.content
                if (content && typeof content === 'string') {
                  await onChunk(content, params.threadId)
                  fullContent += content
                }
              } else {
                await onChunk(undefined, params.threadId, fullEvent as any)
              }
            } else if (!isChatEvent) {
              // Task 相关事件：直接给 eventHandlers
              handleServerEvent(fullEvent as any)
            }
            
            // 🔥 检查是否是 message.done 事件，表示流结束
            if (eventType === 'message.done') {
              logger.debug('[chat.ts] Resume 收到 message.done，流结束')
              isCompleted = true
              clearInterval(timeoutCheck)
              resolve(fullContent)
            }
          }
          
        } catch (e) {
          logger.debug('[chat.ts] Resume 解析 SSE 数据失败，跳过:', msg.data.substring(0, 100))
        }
      },

      onerror(err) {
        if (err.name === 'AbortError' || ctrl.signal.aborted) {
          logger.debug('[chat.ts] Resume 请求已取消')
          clearInterval(timeoutCheck)
          if (!isCompleted) {
            reject(new Error('请求已取消'))
          }
          return
        }
        
        // 🚨🚨🚨 风险 2 修复：流异常断开， reject Promise
        logger.error('[chat.ts] Resume SSE 错误:', err)
        clearInterval(timeoutCheck)
        if (!isCompleted) {
          reject(new Error('连接异常断开，请重试'))
        }
      },

      onclose() {
        logger.debug('[chat.ts] Resume SSE 连接已关闭')
        clearInterval(timeoutCheck)
        
        // ✅ 宽容处理：当连接正常关闭但没有收到完成标志时，视为成功
        // 原因：后端 LangGraph 完成 resume 操作后直接关闭连接，不会发送 [DONE] 标志
        // 即使数据不完整，useSessionRestore 会在页面恢复时自动拉取全量数据
        if (!isCompleted) {
          logger.warn('[chat.ts] Resume SSE 流正常关闭但未收到完成标志，视为成功')
          isCompleted = true
          resolve(fullContent)
        }
      },
    })
  })
}
