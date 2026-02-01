// API 服务 - 通用业务 API
// 非聊天相关的业务 API（认证、用户、智能体管理等）

import { Conversation, UserProfile, ApiMessage } from '@/types'
import { getHeaders, buildUrl } from './common'

// 重新导出类型供外部使用
export type { Conversation, UserProfile, ApiMessage }

// 为了向后兼容，导出别名
export type { ApiMessage as ChatMessage }


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
  const url = buildUrl('/auth/send-code')
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
  const url = buildUrl('/auth/verify-code')
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
  const url = buildUrl('/auth/refresh-token')
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



export async function getUserProfile(): Promise<UserProfile> {
    const response = await fetch(buildUrl('/user/me'), {
        headers: getHeaders()
    });
    if (!response.ok) throw new Error('Failed to fetch user profile');
    return response.json();
}

export async function updateUserProfile(data: Partial<UserProfile>): Promise<UserProfile> {
    const response = await fetch(buildUrl('/user/me'), {
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
  const url = buildUrl('/agents')
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
  const url = buildUrl('/agents')
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
  const url = buildUrl(`/agents/${id}`)
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
  const url = buildUrl(`/agents/${id}`)
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
  const url = buildUrl(`/agents/${id}`)
  const response = await fetch(url, {
    method: 'DELETE',
    headers: getHeaders()
  })
  if (!response.ok) {
    throw new Error('Failed to delete custom agent')
  }
}


