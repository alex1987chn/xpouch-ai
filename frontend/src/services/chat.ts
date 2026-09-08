/**
 * 聊天 API 服务层
 * 
 * P0 修复: 添加 credentials: 'include' 以支持 HttpOnly Cookie
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
 * - resumeChat: HITL 恢复执行，支持用户修改后的计划
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
import { getHeaders, buildUrl, handleResponse, handleSSEConnectionError, authenticatedFetch } from './common'
import { ApiMessage, StreamCallback, Conversation, StreamRuntimeMeta } from '@/types'
import { logger } from '@/utils/logger'
import { handleServerEvent } from '@/handlers'
import { createSSEPromiseHelpers, SSE_HEARTBEAT_TIMEOUT, SSE_HEARTBEAT_CHECK_INTERVAL } from '@/utils/sseUtils'
import { showLoginDialog } from '@/utils/authUtils'
import type { AnyServerEvent, EventType } from '@/types/events'

// 重新导出类型供外部使用（Conversation 类型来自 @/types）
export type { Conversation }

// ============================================================================
// SSE 常量配置
// ============================================================================

// 注意：SSE_HEARTBEAT_TIMEOUT 和 SSE_HEARTBEAT_CHECK_INTERVAL 从 sseUtils.ts 导入
//
// 重连策略：POST+SSE 为非幂等请求（自动重发会重复生成/计费，并可能触发 409
// ACTIVE_RUN_CONFLICT），因此网络错误不做自动重发，明确报错由用户决定重试。

class FatalSSEError extends Error {
  status?: number
  code?: string
  details?: unknown

  constructor(message: string, status?: number, code?: string, details?: unknown) {
    super(message)
    this.name = 'FatalSSEError'
    this.status = status
    this.code = code
    this.details = details
  }
}

type StreamRunOptions = {
  url: string
  requestBody: Record<string, unknown>
  errorContext: string
  logPrefix: string
  threadId?: string
  onChunk?: StreamCallback
  abortSignal?: AbortSignal
  resolveOnMessageDone?: boolean
}

function extractErrorStatus(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null) return undefined
  const maybe = err as { status?: number; statusCode?: number }
  return maybe.status ?? maybe.statusCode
}

async function extractResponseError(response: Response, fallbackMessage: string): Promise<{
  message: string
  status: number
  code?: string
  details?: unknown
}> {
  try {
    const payload = await response.clone().json()
    return {
      message: payload.error?.message || payload.detail || fallbackMessage,
      status: response.status,
      code: payload.error?.code,
      details: payload.error?.details,
    }
  } catch {
    return {
      message: fallbackMessage,
      status: response.status,
    }
  }
}

function runSSEStream({
  url,
  requestBody,
  errorContext,
  logPrefix,
  threadId,
  onChunk,
  abortSignal,
  resolveOnMessageDone = false,
}: StreamRunOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    let fullContent = ''
    /** 收到过完成标记（[DONE] 或 message.done）才允许 onclose 按成功收尾 */
    let doneMarkerReceived = false
    let activeThreadId = threadId
    let activeRunId: string | undefined
    /** B6 断线续传：最近收到的服务端事件 seq（hub 分配的整数 id） */
    let lastSeq = 0
    const ctrl = new AbortController()

    const { safeResolve, safeReject, startHeartbeat, updateActivity, getIsCompleted } = createSSEPromiseHelpers(
      resolve,
      reject,
      {
        timeout: SSE_HEARTBEAT_TIMEOUT,
        checkInterval: SSE_HEARTBEAT_CHECK_INTERVAL,
        onTimeout: () => ctrl.abort(),
        context: errorContext
      }
    )
    startHeartbeat()

    if (abortSignal) {
      abortSignal.addEventListener('abort', () => {
        ctrl.abort()
        safeReject(new Error('请求已取消'))
      })
    }

    // 共享消息处理器：主连接与断线续传连接复用同一套分发/正文流式逻辑
    const handleMessage = async (msg: EventSourceMessage) => {
      updateActivity()

      if (msg.data === '[DONE]') {
        logger.debug(`[chat.ts] ${logPrefix}收到 [DONE]，流式响应完成`)
        doneMarkerReceived = true
        safeResolve(fullContent)
        return
      }

      if (msg.data === '' || msg.event === 'heartbeat') {
        return
      }

      // B6：hub 分配的整数 seq，用于断线后续传
      if (msg.id && /^\d+$/.test(msg.id)) {
        lastSeq = parseInt(msg.id, 10)
      }

      try {
        const eventType = msg.event
        const eventData = JSON.parse(msg.data)

        if (eventType) {
          const runtimeMeta: StreamRuntimeMeta = {
            threadId: activeThreadId,
            runId: activeRunId,
          }
          const fullEvent: AnyServerEvent = {
            id: msg.id || crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            type: eventType as EventType,
            data: eventData
          }

          // 协议 v2 单通道收敛：所有事件统一经 EventHandler（全局唯一分发点），
          // onChunk 只承担两类职责：message.delta 的正文流式、UI 状态同步（runtimeMeta）
          if (eventType === 'message.delta') {
            handleServerEvent(fullEvent)
            const content = eventData.content
            if (content && typeof content === 'string' && onChunk) {
              await onChunk(content, activeThreadId, undefined, undefined, undefined, runtimeMeta)
              fullContent += content
            }
          } else {
            handleServerEvent(fullEvent)
            if (onChunk && (eventType.startsWith('message.') || eventType === 'error')) {
              await onChunk(undefined, activeThreadId, fullEvent, undefined, undefined, runtimeMeta)
            }
          }

          if (resolveOnMessageDone && eventType === 'message.done') {
            doneMarkerReceived = true
            logger.debug(`[chat.ts] ${logPrefix}收到 message.done，流结束`)
            safeResolve(fullContent)
          }
        }
      } catch {
        logger.debug(`[chat.ts] ${logPrefix}解析 SSE 数据失败，跳过:`, msg.data.substring(0, 100))
      }
    }

    /**
     * B6 断线续传：从 lastSeq 之后重放并跟随剩余事件。
     * 返回是否接管了连接（true = 终态处理归 resume 流负责）。
     */
    const attemptResume = (): Promise<boolean> => {
      return new Promise((resolveHandover) => {
        if (!activeRunId || !activeThreadId || lastSeq <= 0) {
          resolveHandover(false)
          return
        }
        let opened = false
        fetchEventSource(
          buildUrl(`/chat/${activeThreadId}/stream/resume?last_event_id=${lastSeq}`),
          {
            method: 'GET',
            headers: { ...getHeaders(), Accept: 'text/event-stream' },
            signal: ctrl.signal,
            openWhenHidden: true,
            async onopen(response) {
              if (!response.ok) {
                resolveHandover(false)
                throw new FatalSSEError('resume unavailable', response.status)
              }
              opened = true
              updateActivity()
              resolveHandover(true)
              logger.debug(`[chat.ts] ${logPrefix}断线续传连接已建立 (after seq=${lastSeq})`)
            },
            onmessage: (msg) => handleMessage(msg),
            onerror(err) {
              if (opened) {
                safeReject(err instanceof Error ? err : new Error('连接中断，请重试'))
                return
              }
              resolveHandover(false)
            },
            onclose() {
              if (doneMarkerReceived) {
                safeResolve(fullContent)
                return
              }
              if (opened) {
                safeReject(new Error('连接中断，回答可能不完整，请重试'))
              }
            },
          }
        ).catch(() => {
          /* 已通过 resolveHandover/safeReject 结算，静默 */
        })
      })
    }

    fetchEventSource(url, {
      method: 'POST',
      headers: {
        ...getHeaders(),
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify(requestBody),
      signal: ctrl.signal,
      openWhenHidden: true,

      async onopen(response) {
        if (!response.ok) {
          const parsedError = await extractResponseError(
            response,
            `SSE 连接失败: ${response.status}`
          )
          const fatalError = new FatalSSEError(
            parsedError.message,
            parsedError.status,
            parsedError.code,
            parsedError.details,
          )
          safeReject(fatalError)
          ctrl.abort()
          throw fatalError
        }
        handleSSEConnectionError(response, errorContext)
        updateActivity()
        logger.debug(`[chat.ts] ${logPrefix}SSE 连接已建立`)

        const responseThreadId = response.headers.get('X-Thread-ID')
        const responseRunId = response.headers.get('X-Run-ID')
        if (responseThreadId) {
          activeThreadId = responseThreadId
        }
        if (responseRunId) {
          activeRunId = responseRunId
        }
        if (onChunk && (responseThreadId || responseRunId)) {
          const runtimeMeta: StreamRuntimeMeta = {
            threadId: activeThreadId,
            runId: activeRunId,
          }
          await onChunk(undefined, activeThreadId, undefined, undefined, undefined, runtimeMeta)
        }
      },

      onmessage: handleMessage,

      onerror(err: unknown) {
        const errorLike = err as { name?: string }
        if (errorLike.name === 'AbortError' || ctrl.signal.aborted) {
          logger.debug(`[chat.ts] ${logPrefix}请求已取消`)
          safeReject(new Error('请求已取消'))
          return
        }

        const status = extractErrorStatus(err)
        if (status === 401) {
          logger.warn(`[chat.ts] ${logPrefix}SSE 收到 401 错误，触发登录弹窗`)
          showLoginDialog()
          safeReject(err instanceof Error ? err : new Error('认证失败'))
          throw new FatalSSEError('认证失败', status)
        }

        if (status !== undefined && status >= 400 && status < 500) {
          logger.error(`[chat.ts] ${logPrefix}SSE 收到 ${status} 客户端错误，停止重试:`, err)
          safeReject(err instanceof Error ? err : new Error(`客户端错误: ${status}`))
          const clientError = err as { code?: string; details?: unknown }
          throw new FatalSSEError(
            err instanceof Error ? err.message : `客户端错误: ${status}`,
            status,
            clientError.code,
            clientError.details,
          )
        }

        // POST+SSE 非幂等：不能重发 POST。优先尝试断点续传（GET，只读重放）：
        // 成功则交接后续事件处理；失败回到"终止 + 提示重试"的原语义
        if (!doneMarkerReceived && activeRunId && activeThreadId && lastSeq > 0) {
          logger.warn(`[chat.ts] ${logPrefix}SSE 网络错误，尝试断点续传 (after seq=${lastSeq})`)
          void attemptResume().then((handover) => {
            if (!handover) {
              safeReject(err instanceof Error ? err : new Error('连接异常，请重试'))
            }
          })
          // 抛出以停止主连接重试；异常由外层 catch 静默（结算权已交接）
          throw new FatalSSEError('CONNECTION_HANDOVER')
        }

        logger.error(`[chat.ts] ${logPrefix}SSE 网络错误，终止连接（不自动重发）:`, err)
        safeReject(err instanceof Error ? err : new Error('连接异常，请重试'))
        throw new FatalSSEError('连接异常，请重试')
      },

      onclose() {
        logger.debug(`[chat.ts] ${logPrefix}SSE 连接已关闭`)
        if (getIsCompleted()) return
        if (doneMarkerReceived) {
          safeResolve(fullContent)
          return
        }
        // 无完成标记的关闭 = 服务端异常断流：按错误处理，而非把截断内容当成功
        logger.warn(`[chat.ts] ${logPrefix}连接关闭但未收到完成标记，内容可能被截断`)
        safeReject(new Error('连接中断，回答可能不完整，请重试'))
      },
    }).catch((swallowErr: unknown) => {
      // CONNECTION_HANDOVER：结算权已交接给 resume 流；其余错误已由 safeReject 结算
      const e = swallowErr as { message?: string }
      if (e?.message !== 'CONNECTION_HANDOVER') {
        logger.debug(`[chat.ts] ${logPrefix}主连接终止:`, swallowErr)
      }
    })
  })
}

// ============================================================================
// API 函数
// ============================================================================

/**
 * 分页会话列表响应
 */
export interface PaginatedConversations {
  items: Conversation[]
  total: number
  page: number
  limit: number
  pages: number
}

/**
 * 获取会话列表（支持分页）
 * @param page 页码（从1开始）
 * @param limit 每页条数（默认20）
 */
export async function getConversations(page: number = 1, limit: number = 20): Promise<PaginatedConversations> {
  const response = await authenticatedFetch(
    buildUrl(`/threads?page=${page}&limit=${limit}`), 
    { headers: getHeaders() }
  )
  return handleResponse<PaginatedConversations>(response, '获取会话列表失败')
}

/**
 * 获取单个会话详情（包含完整消息）
 */
export async function getConversation(id: string): Promise<Conversation> {
  const response = await authenticatedFetch(buildUrl(`/threads/${id}`), {
    headers: getHeaders()
  })
  return await handleResponse<Conversation>(response, '获取会话详情失败')
}

/**
 * 获取会话消息列表（单独端点，P0-5 优化）
 */
export async function getThreadMessages(threadId: string): Promise<ApiMessage[]> {
  const response = await authenticatedFetch(buildUrl(`/threads/${threadId}/messages`), {
    headers: getHeaders()
  })
  return handleResponse<ApiMessage[]>(response, '获取消息列表失败')
}

/**
 * 删除单个会话
 */
export async function deleteConversation(id: string): Promise<void> {
  const response = await authenticatedFetch(buildUrl(`/threads/${id}`), {
    method: 'DELETE',
    headers: getHeaders()
  })
  return handleResponse<void>(response, '删除会话失败')
}

/**
 * 批量删除会话
 */
export interface BatchDeleteResult {
  success: boolean
  deleted_count: number
  failed_ids: string[]
}

export async function deleteConversationsBatch(ids: string[]): Promise<BatchDeleteResult> {
  const response = await authenticatedFetch(buildUrl('/threads/batch-delete'), {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ thread_ids: ids })
  })
  return handleResponse<BatchDeleteResult>(response, '批量删除会话失败')
}

/**
 * 发送消息 - 流式输出
 * v3.0: 只处理新协议事件
 */
export async function sendMessage(
  messages: ApiMessage[],
  agentId: string = 'default-chat',
  onChunk?: StreamCallback,
  threadId?: string | null,
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
        thread_id: threadId,
        stream: false,
        message_id: assistantMessageId,  // v3.0: 传递助手消息 ID
      }),
      signal: abortSignal
    })
    const result = await handleResponse<unknown>(response, '发送消息失败')
    return typeof result === 'string' ? result : JSON.stringify(result)
  }

  return runSSEStream({
    url,
    requestBody: {
      message: messageContent,
      history: history.map(m => ({ role: m.role, content: m.content })),
      agent_id: agentId,
      thread_id: threadId,
      stream: true,
      message_id: assistantMessageId,
    },
    errorContext: 'chat.ts',
    logPrefix: '',
    threadId: threadId || undefined,
    onChunk,
    abortSignal,
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
  const response = await authenticatedFetch(buildUrl(`/artifacts/${params.artifactId}`), {
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
  runId: string
  planVersion: number
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
        run_id: params.runId,
        plan_version: params.planVersion,
        updated_plan: params.updatedPlan,
        approved: params.approved
      }),
      signal: abortSignal,
      // P0 修复: 允许携带 Cookie
      credentials: 'include'
    })
    const result = await handleResponse<unknown>(response, '恢复执行失败')
    return typeof result === 'string' ? result : JSON.stringify(result)
  }

  // 🔥 流式响应：复用与 sendMessage 完全相同的 SSE 处理逻辑
  // 🔥 心跳检测：超时处理，防止 Promise 无限等待
  return runSSEStream({
    url,
    requestBody: {
      thread_id: params.threadId,
      run_id: params.runId,
      plan_version: params.planVersion,
      updated_plan: params.updatedPlan,
      approved: params.approved
    },
    errorContext: 'chat.ts resume',
    logPrefix: 'Resume ',
    threadId: params.threadId,
    onChunk,
    abortSignal,
    resolveOnMessageDone: true,
  })
}

export async function cancelRun(runId: string): Promise<{ status: string; message: string }> {
  const response = await authenticatedFetch(buildUrl(`/runs/${runId}/cancel`), {
    method: 'POST',
    headers: getHeaders(),
  })
  return handleResponse<{ status: string; message: string }>(response, '取消运行失败')
}
