// API 服务 - 通过后端代理调用 AI 模型
// 统一使用 LangGraph 工作流

// 从统一类型定义文件导入
import {
  ApiMessage,
  Conversation,
  UserProfile
} from '@/types'

// 智能判断环境：本地开发直连后端，生产环境走 Nginx 代理
const API_BASE_URL = import.meta.env.DEV
  ? 'http://127.0.0.1:3002/api'
  : '/api'

// 获取或生成客户端ID (简单的 UUID 生成，兼容低版本浏览器)
function getClientId(): string {
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

/**
 * 发送消息给 AI - 流式输出
 */
export async function sendMessage(
  messages: ApiMessage[],
  agentId: string = 'assistant',
  onChunk?: (chunk: string, conversationId?: string) => void,
  conversationId?: string | null
): Promise<string> {
  
  // 提取最新一条消息作为当前 prompt，其他的作为 history
  const history = messages.slice(0, -1)
  const lastMessage = messages[messages.length - 1]
  const messageContent = lastMessage.content

  // 如果提供了 onChunk 回调，尝试使用流式输出
  if (onChunk) {
    const url = `${API_BASE_URL}/chat`

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
                if (parsed.conversationId) {
                    finalConversationId = parsed.conversationId
                }
                
                if (content) {
                  fullContent += content
                  onChunk(content, finalConversationId)
                } else if (finalConversationId && !content) {
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
