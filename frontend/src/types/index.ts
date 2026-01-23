// 统一类型定义文件
// 消除类型定义分散的问题

// ============================================
// 消息相关类型
// ============================================

/**
 * 基础消息接口 - 用于 UI 组件
 */
export interface Message {
  id?: string
  role: 'user' | 'assistant' | 'system'
  content: string
  isTyping?: boolean
  timestamp?: number | string
  metadata?: MessageMetadata
}

/**
 * 消息元数据（用于专家任务等）
 */
export interface MessageMetadata {
  type?: 'task_plan' | 'task_start' | 'expert_completion'
  expertId?: string
}

/**
 * API 消息接口 - 用于后端 API 交互
 * 包含 system 角色，用于对话历史
 */
export interface ApiMessage {
  id?: string
  role: 'system' | 'user' | 'assistant'
  content: string
  timestamp?: Date | string
  isTyping?: boolean
}

/**
 * 数据库消息接口 - 用于数据库返回
 */
export interface DBMessage {
  id?: string | number
  role: 'user' | 'assistant'
  content: string
  timestamp?: string | Date
}

// ============================================
// 会话相关类型
// ============================================

/**
 * 会话类型枚举
 */
export type ConversationAgentType = 'default' | 'custom' | 'ai'

/**
 * 会话接口
 */
export interface Conversation {
  id: string
  title: string
  agent_id: string
  agent_type?: ConversationAgentType  // 会话类型：default（默认助手）、custom（自定义智能体）、ai（AI助手/复杂模式）
  user_id: string
  created_at: string
  updated_at: string
  messages?: Message[]
  messageCount?: number
}

// ============================================
// 智能体相关类型
// ============================================

/**
 * 智能体接口
 */
export interface Agent {
    id: string
    name: string
    description: string
    icon: string | React.ReactNode
    systemPrompt?: string
    category?: string
    color?: string
    modelId?: string
    promptTemplate?: string
    isDefault?: boolean
    isCustom?: boolean
    is_builtin?: boolean // 标识是否为预定义专家
    isCreateCard?: boolean // 标识是否为创建智能体卡片
}

/**
 * 智能体类型
 */
export type AgentType = 'system' | 'custom'

/**
 * 智能体上下文 - 双轨制统一接口
 */
export interface AgentContext {
    type: AgentType
    config: Agent
    threadId: string
}

/**
 * 自定义智能体数据接口
 */
export interface CustomAgentData {
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

/**
 * 智能体类别
 */
export type AgentCategory =
  | 'general'
  | 'coding'
  | 'writing'
  | 'analysis'
  | 'creative'
  | 'education'

// ============================================
// 用户相关类型
// ============================================

/**
 * 用户资料接口
 */
export interface UserProfile {
  id: string
  username: string
  avatar?: string
  plan: string
}

// ============================================
// 任务节点类型
// ============================================

/**
 * 任务节点接口
 */
export interface TaskNode {
  id: string
  title: string
  status: 'pending' | 'in-progress' | 'completed'
  children?: TaskNode[]
  color?: string
  icon?: string
  description?: string
}

// ============================================
// 路由状态类型
// ============================================

/**
 * 聊天页面路由状态
 */
export interface ChatPageState {
  startWith?: string
  agentId?: string
}

// ============================================
// 专家状态事件类型
// ============================================

/**
 * 专家状态事件类型
 */
export interface ExpertEvent {
  type: 'expert_activated' | 'expert_completed'
  expertId: string
}

/**
 * Artifact（代码/图表等）类型
 */
export interface Artifact {
  id: string  // 唯一标识符
  type: 'code' | 'markdown' | 'search' | 'html' | 'text'
  language?: string
  content: string
  source?: string
  title?: string  // Artifact 的自定义标题
  timestamp?: string  // 创建时间
}

/**
 * ArtifactSession - 每个专家的交付物会话
 * 支持多个交付物的管理和切换
 */
export interface ArtifactSession {
  expertType: string  // 专家类型（如 'writer', 'coder'）
  artifacts: Artifact[]  // 该专家的所有交付物
  currentIndex: number  // 当前展示的交付物索引
  createdAt: string  // 会话创建时间
  updatedAt: string  // 会话最后更新时间
}

// ============================================
// 类型守卫函数
// ============================================

/**
 * 检查是否为有效的消息角色
 */
export function isValidMessageRole(role: string): role is 'user' | 'assistant' {
  return role === 'user' || role === 'assistant'
}

/**
 * 检查是否为有效的 API 消息角色
 */
export function isValidApiMessageRole(role: string): role is 'system' | 'user' | 'assistant' {
  return role === 'system' || role === 'user' || role === 'assistant'
}

/**
 * 将 API 消息转换为 UI 消息
 */
export function apiMessageToMessage(apiMessage: ApiMessage): Message {
  return {
    id: apiMessage.id,
    role: apiMessage.role === 'system' ? 'assistant' : apiMessage.role, // 将 system 转换为 assistant
    content: apiMessage.content,
    isTyping: apiMessage.isTyping,
    timestamp: apiMessage.timestamp ? String(apiMessage.timestamp) : undefined
  }
}

/**
 * 将数据库消息转换为 UI 消息
 */
export function dbMessageToMessage(dbMessage: DBMessage): Message {
  return {
    id: dbMessage.id ? String(dbMessage.id) : undefined,
    role: dbMessage.role,
    content: dbMessage.content,
    timestamp: dbMessage.timestamp ? String(dbMessage.timestamp) : undefined
  }
}
