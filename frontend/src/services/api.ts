// API 服务 - 通过后端代理调用 AI 模型
// 统一使用 LangGraph 工作流

// 从统一类型定义文件导入
import {
  ApiMessage,
  Conversation,
  UserProfile,
  ExpertEvent,
  Artifact,
  CustomAgentData
} from '@/types'

// 智能判断环境：统一使用相对路径，由 Vite 代理或 Nginx 处理
const API_BASE_URL = '/api'

import { logger } from '@/utils/logger'

// 获取或生成客户端ID (简单的 UUID 生成，兼容低版本浏览器)
export function getClientId(): string {
  const STORAGE_KEY = 'xpouch_client_id';
  let clientId = localStorage.getItem(STORAGE_KEY);
  if (!clientId) {
    clientId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
    localStorage.setItem(STORAGE_KEY, clientId);
  }
  return clientId;
}

// 统一请求头（优先使用JWT，回退到X-User-ID）
export function getHeaders() {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // 优先使用JWT token（从Zustand persist读取）
  const storageData = localStorage.getItem('xpouch-user-storage');
  if (storageData) {
    try {
      // Zustand persist存储的数据结构：{ state: {...}, version: 0 }
      const parsed = JSON.parse(storageData);
      const accessToken = parsed.state?.accessToken;
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
        return headers;
      }
    } catch (e) {
      logger.warn('[API Headers] 解析token失败:', e);
    }
  }

  // 回退到X-User-ID（向后兼容）
  headers['X-User-ID'] = getClientId();
  return headers;
}


// ============================================================================
// 认证 API (Authentication)
// ============================================================================

interface SendCodeRequest {
  phone_number: string
}

interface SendCodeResponse {
  message: string
  expires_in: number
  phone_masked: string
  _debug_code?: string  // 开发环境返回验证码
  user_id?: string
}

interface VerifyCodeRequest {
  phone_number: string
  code: string
}

interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
  user_id: string
  username: string
}

export async function sendVerificationCode(phoneNumber: string): Promise<SendCodeResponse> {
  const url = `${API_BASE_URL}/auth/send-code`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone_number: phoneNumber })
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || '发送验证码失败')
  }
  return response.json()
}

export async function verifyCodeAndLogin(phoneNumber: string, code: string): Promise<TokenResponse> {
  const url = `${API_BASE_URL}/auth/verify-code`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone_number: phoneNumber, code })
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || '验证失败')
  }
  return response.json()
}

export async function refreshTokenApi(refreshToken: string): Promise<TokenResponse> {
  const url = `${API_BASE_URL}/auth/refresh-token`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken })
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || '刷新token失败')
  }
  return response.json()
}

// 重新导出类型供外部使用
export type { ApiMessage, Conversation, UserProfile }

// 为了向后兼容，导出别名
export type { ApiMessage as ChatMessage }

export async function getUserProfile(): Promise<UserProfile> {
    const response = await fetch(`${API_BASE_URL}/user/me`, {
        headers: getHeaders()
    });
    if (!response.ok) throw new Error('Failed to fetch user profile');
    return response.json();
}

export async function updateUserProfile(data: Partial<UserProfile>): Promise<UserProfile> {
    const response = await fetch(`${API_BASE_URL}/user/me`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(data)
    });

    if (!response.ok) {
        throw new Error('Failed to update user profile');
    }

    const result = await response.json();
    return result;
}

// 会话相关 API 从 chat.ts 重新导出
export { getConversations, getConversation, deleteConversation } from './chat'

// ============================================================================
// 自定义智能体 API (Custom Agents - User-defined)
// ============================================================================

interface CustomAgent {
  id: string
  user_id: string
  name: string
  description?: string
  system_prompt: string
  model_id: string
  category: string
  conversation_count: number
  is_public: boolean
  created_at: string
  updated_at: string
}

interface CreateAgentRequest {
  name: string
  description?: string
  systemPrompt: string
  category?: string
  modelId?: string
}

// 创建自定义智能体
export async function createCustomAgent(agent: CreateAgentRequest): Promise<CustomAgent> {
  const url = `${API_BASE_URL}/agents`
  const response = await fetch(url, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(agent)
  })
  if (!response.ok) {
    throw new Error('Failed to create custom agent')
  }
  return response.json()
}

// 获取所有自定义智能体
export async function getAllAgents() {
  // 从后端获取自定义智能体
  const url = `${API_BASE_URL}/agents`
  const response = await fetch(url, {
    headers: getHeaders()
  })
  if (!response.ok) {
    throw new Error('Failed to fetch custom agents')
  }

  const data = await response.json()

  // 转换自定义智能体数据格式
  return data.map((agent: any) => ({
    ...agent,
    id: agent.id,
    name: agent.name,
    description: agent.description || '',
    icon: 'bot' // 默认图标
  }))
}



// 获取单个自定义智能体
export async function getCustomAgent(id: string): Promise<CustomAgent> {
  const url = `${API_BASE_URL}/agents/${id}`
  const response = await fetch(url, {
    headers: getHeaders()
  })
  if (!response.ok) {
    throw new Error('Failed to fetch custom agent')
  }
  return response.json()
}

// 更新自定义智能体
export async function updateCustomAgent(id: string, agent: Partial<CreateAgentRequest>): Promise<CustomAgent> {
  const url = `${API_BASE_URL}/agents/${id}`
  const response = await fetch(url, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(agent)
  })
  if (!response.ok) {
    throw new Error('Failed to update custom agent')
  }
  return response.json()
}

// 删除自定义智能体
export async function deleteCustomAgent(id: string): Promise<void> {
  const url = `${API_BASE_URL}/agents/${id}`
  const response = await fetch(url, {
    method: 'DELETE',
    headers: getHeaders()
  })
  if (!response.ok) {
    throw new Error('Failed to delete custom agent')
  }
}

/**
 * 发送消息给 AI - 流式输出
 */
export async function sendMessage(
  messages: ApiMessage[],
  agentId: string | null | undefined = null,  // 👈 支持传递 null/undefined，交由后端处理默认值
  onChunk?: (chunk: string, conversationId?: string, expertEvent?: ExpertEvent, artifact?: Artifact) => void,
  conversationId?: string | null,
  abortSignal?: AbortSignal
): Promise<string> {

  // 提取最新一条消息作为当前 prompt，其他的作为 history
  const history = messages.slice(0, -1)
  const lastMessage = messages[messages.length - 1]
  const messageContent = lastMessage.content

  // 统一调用 /api/chat
  const url = `${API_BASE_URL}/chat`

  // 如果提供了 onChunk 回调，尝试使用流式输出
  if (onChunk) {

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          message: messageContent,
          history: history.map(m => ({
            role: m.role,
            content: m.content
          })),
          agentId,  // 👈 可以是 null/undefined，后端会处理为 sys-default-chat
          conversationId,
          stream: true,
        }),
        signal: abortSignal
      })

      if (!response.ok) {
        logger.error('[api.ts] 请求失败:', response.status, response.statusText)
        throw new Error(`API Error: ${response.status}`);
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('Response body is not readable')
      }

      const decoder = new TextDecoder()
      let fullContent = ''
      let buffer = ''
      let finalConversationId: string | undefined

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
                // 兼容 Python 后端返回格式: { content: "...", conversationId: "..." }
                const content = parsed.content
                const activeExpert = parsed.activeExpert
                const expertCompleted = parsed.expertCompleted
                const artifact = parsed.artifact
                const allArtifacts = parsed.allArtifacts as Array<any> | undefined
                const taskPlan = parsed.taskPlan
                const taskStart = parsed.taskStart
                const routerDecision = parsed.routerDecision  // 👈 Router 决策事件

                if (parsed.conversationId) {
                    finalConversationId = parsed.conversationId
                }

                // 👈 处理 Router 决策事件（简单模式 vs 复杂模式）
                if (routerDecision && typeof onChunk === 'function') {
                  // @ts-ignore - 扩展回调签名支持 Router 决策
                  onChunk('', finalConversationId, { type: 'router_decision', decision: routerDecision })
                }

                // 处理专家激活事件（传递给回调）
                if (activeExpert && typeof onChunk === 'function') {
                  // 调用回调，传递专家激活信息
                  // @ts-ignore - 扩展回调签名支持专家状态
                  onChunk('', finalConversationId, { type: 'expert_activated', expertId: activeExpert })
                }

                // 处理专家完成事件（包含完整信息）
                if (expertCompleted && typeof onChunk === 'function') {
                  const expertEvent = {
                    type: 'expert_completed' as const,
                    expertId: expertCompleted,
                    description: parsed.description || '',
                    duration_ms: parsed.duration_ms,
                    status: parsed.status,
                    output: parsed.output,
                    error: parsed.error,
                    allArtifacts: allArtifacts || []
                  }
                  // @ts-ignore - 扩展回调签名支持专家状态
                  onChunk('', finalConversationId, expertEvent)
                }

                // 处理 taskPlan 事件（任务计划展示）
                if (taskPlan && typeof onChunk === 'function') {
                  console.log('[API] 收到 taskPlan 事件:', taskPlan)
                  // @ts-ignore - 扩展回调签名支持任务计划
                  onChunk('', finalConversationId, { type: 'task_plan', ...taskPlan })
                }

                // 处理 taskStart 事件（任务开始展示）
                if (taskStart && typeof onChunk === 'function') {
                  // @ts-ignore - 扩展回调签名支持任务开始
                  onChunk('', finalConversationId, { type: 'task_start', ...taskStart })
                }

                // 处理 artifact 事件
                if (artifact && typeof onChunk === 'function') {
                  // @ts-ignore - 扩展回调签名支持 artifact
                  onChunk('', finalConversationId, undefined, artifact, activeExpert || null)
                }

                if (content) {
                  fullContent += content
                  // 如果是最终响应，不通过onChunk处理（避免双重渲染）
                  if (!parsed.isFinal) {
                    onChunk(content, finalConversationId)
                  }
                  // isFinal=True时，将内容存入fullContent但暂时不渲染
                } else if (finalConversationId && !content && !activeExpert && !expertCompleted && !artifact && !taskPlan) {
                   // 某些包可能只包含 conversationId
                   onChunk('', finalConversationId)
                }
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
    } catch (error) {
      throw error
    }
  }

  return ''
}
