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

// 统一请求头
const getHeaders = () => ({
  'Content-Type': 'application/json',
  'X-User-ID': getClientId()
});

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
    if (!response.ok) throw new Error('Failed to update user profile');
    return response.json();
}

// 获取会话列表
export async function getConversations(): Promise<Conversation[]> {
  const url = `${API_BASE_URL}/conversations`
  const response = await fetch(url, {
      headers: getHeaders()
  })
  if (!response.ok) {
    throw new Error('Failed to fetch conversations')
  }
  return await response.json()
}

// 获取单个会话详情
export async function getConversation(id: string): Promise<Conversation> {
  const url = `${API_BASE_URL}/conversations/${id}`
  const response = await fetch(url, {
      headers: getHeaders()
  })
  if (!response.ok) {
    throw new Error('Failed to fetch conversation')
  }
  return await response.json()
}

// 删除会话
export async function deleteConversation(id: string): Promise<void> {
  const url = `${API_BASE_URL}/conversations/${id}`
  const response = await fetch(url, { 
    method: 'DELETE',
    headers: getHeaders()
  })
  if (!response.ok) {
    throw new Error('Failed to delete conversation')
  }
}

// ============================================================================
// 系统智能体 API (System Agents - LangGraph Experts)
// ============================================================================

/**
 * 获取系统智能体列表
 * 这些是预定义的专家，由系统维护
 */
export async function getSystemAgents() {
  // 从本地注册表返回系统智能体
  // 不需要后端调用，因为是常量数据
  const { SYSTEM_AGENTS } = await import('@/constants/systemAgents')
  return SYSTEM_AGENTS
}

/**
 * 根据ID获取系统智能体
 */
export async function getSystemAgentById(agentId: string) {
  const { getSystemAgent } = await import('@/constants/systemAgents')
  return getSystemAgent(agentId)
}

/**
 * 直接获取系统智能体（同步版本，不使用 await）
 * 从 systemAgents.ts 重新导出，方便直接调用
 */
export async function getSystemAgent(agentId: string) {
  const { getSystemAgent: getSysAgent } = await import('@/constants/systemAgents')
  return getSysAgent(agentId)
}

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

/**
 * 获取指定类型的智能体
 */
export async function getAgentsByType(type: 'system' | 'custom'): Promise<any[]> {
  if (type === 'system') {
    return await getSystemAgents()
  } else {
    return await getAllAgents()
  }
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
  agentId: string = 'assistant',
  onChunk?: (chunk: string, conversationId?: string, expertEvent?: ExpertEvent, artifact?: Artifact) => void,
  conversationId?: string | null,
  abortSignal?: AbortSignal,
  mode: 'simple' | 'complex' = 'simple'
): Promise<string> {

  // 提取最新一条消息作为当前 prompt，其他的作为 history
  const history = messages.slice(0, -1)
  const lastMessage = messages[messages.length - 1]
  const messageContent = lastMessage.content

  // 根据模式选择端点
  const endpoint = mode === 'simple' ? '/chat-simple' : '/chat'
  const url = `${API_BASE_URL}${endpoint}`

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
          agentId,
          conversationId,
          stream: true,
        }),
        signal: abortSignal
      })

      if (!response.ok) {
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

                if (parsed.conversationId) {
                    finalConversationId = parsed.conversationId
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
                    duration_ms: parsed.duration_ms,
                    status: parsed.status,
                    output: parsed.output,
                    error: parsed.error,
                    allArtifacts: allArtifacts || []
                  }
                  // @ts-ignore - 扩展回调签名支持专家状态
                  onChunk('', finalConversationId, expertEvent)
                }

                // 处理 artifact 事件
                if (artifact && typeof onChunk === 'function') {
                  // @ts-ignore - 扩展回调签名支持 artifact
                  onChunk('', finalConversationId, undefined, artifact, activeExpert || null)
                }

                if (content) {
                  fullContent += content
                  onChunk(content, finalConversationId)
                } else if (finalConversationId && !content && !activeExpert && !expertCompleted && !artifact) {
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
