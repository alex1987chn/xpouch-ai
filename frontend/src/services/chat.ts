/**
 * 聊天相关 API 服务
 * 使用 @microsoft/fetch-event-source 处理 SSE 流式响应
 */

import { fetchEventSource, EventSourceMessage } from '@microsoft/fetch-event-source'
import { getHeaders, buildUrl, handleResponse } from './common'
import { ApiMessage, StreamCallback, ExpertEvent, Conversation } from '@/types'
import { logger } from '@/utils/logger'

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
 * 使用 @microsoft/fetch-event-source 处理 SSE，支持自动重连和优雅降级
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

  // 流式模式 - 使用 fetch-event-source
  return new Promise((resolve, reject) => {
    let fullContent = ''
    let finalConversationId: string | undefined = conversationId || undefined
    let isCompleted = false

    const ctrl = new AbortController()

    // 如果外部有 abortSignal，同步取消
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
      }),
      signal: ctrl.signal,

      // ✅ 连接打开
      async onopen(response) {
        if (!response.ok) {
          logger.error('[chat.ts] SSE 连接失败:', response.status, response.statusText)
          throw new Error(`API Error: ${response.status}`)
        }
        logger.debug('[chat.ts] SSE 连接已打开')
      },

      // ✅ 收到消息
      async onmessage(msg: EventSourceMessage) {
        // msg.data 是 SSE 的 data 字段
        if (msg.data === '[DONE]') {
          logger.debug('[chat.ts] 收到 [DONE]，流式响应完成')
          isCompleted = true
          ctrl.abort() // 主动关闭连接
          resolve(fullContent)
          return
        }

        try {
          const parsed = JSON.parse(msg.data)
          const result = await processSSEData(parsed, onChunk, finalConversationId, fullContent)
          if (result.conversationId) {
            finalConversationId = result.conversationId
          }
          fullContent = result.content
        } catch (e) {
          // Failed to parse SSE data, skip
          logger.debug('[chat.ts] 解析 SSE 数据失败，跳过:', msg.data.substring(0, 100))
        }
      },

      // ✅ 错误处理 - 阻止由后端Crash触发的自动重试
      onerror(err) {
        // 用户主动取消不算错误
        if (err.name === 'AbortError' || ctrl.signal.aborted) {
          logger.debug('[chat.ts] 请求已取消')
          return
        }

        logger.error('[chat.ts] SSE 错误:', err)

        // 👈 直接 throw err，不返回重试延迟时间，阻止自动重试
        throw err
      },

      // ✅ 连接关闭
      onclose() {
        logger.debug('[chat.ts] SSE 连接已关闭')
        if (!isCompleted) {
          // 非正常关闭，但已经有内容，视为成功
          resolve(fullContent)
        }
      },
    })
  })
}

/**
 * 处理 SSE 数据包
 * 保持与之前版本一致的逻辑
 */
async function processSSEData(
  data: any,
  onChunk: StreamCallback,
  conversationId?: string,
  fullContent: string = ''
): Promise<{ conversationId?: string; content: string }> {
  const content = data.content
  const activeExpert = data.activeExpert
  const expertCompleted = data.expertCompleted
  // const artifact = data.artifact  // ⚠️ 已合并到 expertCompleted 事件中处理
  const allArtifacts = data.allArtifacts as Array<any> | undefined
  const taskPlan = data.taskPlan
  const taskStart = data.taskStart
  const routerDecision = data.routerDecision

  let finalConversationId = data.conversationId || conversationId
  let updatedContent = fullContent

  // 👈 调试日志
  const DEBUG = import.meta.env.VITE_DEBUG_MODE === 'true'
  if (DEBUG && content) {
    logger.debug('[chat.ts processSSEData] 收到内容 chunk:', content.substring(0, 50), 'total length:', updatedContent.length + content.length)
  }

  // 👈 处理 Router 决策事件（简单模式 vs 复杂模式）
  if (routerDecision) {
    await onChunk(undefined, finalConversationId, {
      type: 'router_decision',
      decision: routerDecision
    })
  }

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
    logger.debug('[chat.ts] 处理 taskPlan 事件:', taskPlan)
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

  // ⚠️ 注意：artifact 事件已合并到 expertCompleted 事件中处理
  // 避免重复添加 artifact，这里不再单独处理
  // if (artifact && activeExpert) {
  //   const fullArtifact: Artifact = {
  //     id: crypto.randomUUID(),
  //     timestamp: new Date().toISOString(),
  //     type: artifact.type,
  //     title: artifact.title,
  //     content: artifact.content,
  //     language: artifact.language
  //   }
  //   await onChunk(undefined, finalConversationId, undefined, fullArtifact, activeExpert)
  // }

  // 处理内容（过滤掉看起来像任务计划 JSON 的内容）
  if (content) {
    // 👈 安全检查：过滤掉内部任务计划 JSON，避免泄露到聊天界面
    let trimmedContent = content.trim()

    // 移除 Markdown 代码块标记（如 ```json ... ```）
    const codeBlockMatch = trimmedContent.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
    if (codeBlockMatch) {
      trimmedContent = codeBlockMatch[1].trim()
    }

    // 检查是否是完整的 task plan JSON（必须同时包含这三个字段才过滤）
    const lowerContent = trimmedContent.toLowerCase()
    const isTaskPlan = (
      trimmedContent.startsWith('{') &&
      trimmedContent.endsWith('}') &&
      lowerContent.includes('"tasks"') &&
      lowerContent.includes('"strategy"') &&
      lowerContent.includes('"estimated_steps"')
    )

    if (isTaskPlan) {
      // 这看起来像任务计划 JSON，跳过不显示
      logger.warn('[chat.ts processSSEData] 过滤掉任务计划 JSON (不显示在对话中):', content.substring(0, 100))
    } else {
      await onChunk(content, finalConversationId)
      // 👈 累加内容到 fullContent
      updatedContent += content
    }
  }

  return { conversationId: finalConversationId, content: updatedContent }
}
