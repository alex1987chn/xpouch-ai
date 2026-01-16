// API 服务 - 通过后端代理调用 AI 模型
// 统一使用 LangGraph 工作流

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

export interface ChatMessage {
  id?: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp?: Date | string;
  isTyping?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  agent_id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  messages?: ChatMessage[];
  messageCount?: number;
}

// 用户相关接口
export interface UserProfile {
    id: string;
    username: string;
    avatar?: string;
    plan: string;
}

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
  model: string, // 保留参数但暂不使用
  messages: ChatMessage[],
  agentId: string = 'assistant',
  onChunk?: (chunk: string, conversationId?: string) => void,
  conversationId?: string | null
): Promise<string> {
  // 避免 lint 报错，临时使用 model 变量
  void model
  
  // 提取最新一条消息作为当前 prompt，其他的作为 history
  const history = messages.slice(0, -1)
  const lastMessage = messages[messages.length - 1]
  const messageContent = lastMessage.content

  // 如果提供了 onChunk 回调，尝试使用流式输出
  if (onChunk) {
    const url = `${API_BASE_URL}/chat`
    console.log('[API] Streaming request:', { url, agentId, conversationId })

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
                console.warn('[API] Failed to parse SSE data:', e, data)
              }
            }
          }
        }
      } finally {
        reader.releaseLock()
      }

      return fullContent
    } catch (error) {
      console.error('[API] Streaming error:', error)
      throw error
    }
  }

  return ''
}
