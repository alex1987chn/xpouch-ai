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
 * 思考过程步骤
 */
export interface ThinkingStep {
  id: string
  expertType: string
  expertName: string
  content: string
  timestamp: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  /**
   * 步骤类型，用于 UI 区分显示图标
   * - search: 联网搜索
   * - reading: 深度阅读/网页阅读 (Jina Reader)
   * - analysis: 分析思考
   * - coding: 代码生成
   * - planning: 任务规划
   * - writing: 写作生成
   * - artifact: 产物生成 (实时流式渲染)
   * - memory: 记忆检索
   * - default: 默认/其他
   */
  type?: 'search' | 'reading' | 'analysis' | 'coding' | 'planning' | 'writing' | 'artifact' | 'memory' | 'execution' | 'default'
  /**
   * 执行耗时（毫秒）
   */
  duration?: number
  /**
   * 相关 URL（如 reading 类型时的网页链接）
   */
  url?: string
}

/**
 * 消息元数据（用于专家任务等）
 */
export interface MessageMetadata {
  type?: 'task_plan' | 'task_start' | 'expert_completion'
  expertId?: string
  thinking?: ThinkingStep[]
  reasoningContent?: string
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
  extra_data?: {
    thinking?: {
      text?: string
      steps?: ThinkingStep[]
    }
  }
}

// ============================================
// 会话相关类型
// ============================================

/**
 * 会话类型枚举
 */
export type ConversationAgentType = 'default' | 'custom' | 'ai'

/**
 * 会话列表项接口（轻量级，不包含消息内容）
 */
export interface Conversation {
  id: string
  title: string
  agent_id: string
  agent_type?: ConversationAgentType
  user_id: string
  created_at: string
  updated_at: string
  status?: string
  thread_mode?: 'simple' | 'complex'
  execution_plan_id?: string
  // P0-5 优化：列表接口不再返回完整消息，只返回数量和预览
  message_count?: number
  last_message_preview?: string
  // messages 现在需要通过单独的 API 获取
  messages?: Message[]
  execution_plan?: ExecutionPlan
}

/**
 * 会话详情接口（包含完整消息）
 */
export interface ConversationDetail extends Conversation {
  messages: Message[]
}

/**
 * 执行计划接口 - 记录复杂模式下的一次完整任务编排过程
 */
export interface ExecutionPlan {
  id: string
  execution_plan_id: string
  run_id?: string
  thread_id: string  // 关联的线程ID
  user_query: string
  final_response?: string
  status?: string
  sub_tasks?: SubTask[]
  plan_version?: number
  created_at?: string
  updated_at?: string
}

/**
 * 子任务接口 - 专家执行的具体任务
 */
export interface SubTask {
  id: string
  execution_plan_id: string
  expert_type: string
  task_description: string
  status?: string
  output_result?: Record<string, unknown> | string | null  // 后端返回的原始输出结果
  error_message?: string  // 后端返回的错误信息
  output?: string  // 前端转换后的输出（兼容字段）
  error?: string  // 前端转换后的错误（兼容字段）
  artifacts?: Artifact[]  // Artifacts数据
  duration_ms?: number
  created_at?: string
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
    icon: string  // 后端只返回字符串（Emoji 或 URL）
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
    role: 'user' | 'admin'  // 用户角色
    updated_at: string  // 用户信息更新时间戳，用于同步
}

// ============================================
// 任务节点类型
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
 * SSE 流式回调类型
 */
export type StreamCallback = (
  chunk: string | undefined,
  threadId?: string,
  expertEvent?: ExpertEvent,
  artifact?: Artifact,
  expertId?: string
) => Promise<void> | void

/**
 * Artifact 类型枚举 - 统一前后端定义
 * 注意：修改此枚举需要同步更新后端代码
 */
export type ArtifactType = 'code' | 'markdown' | 'search' | 'html' | 'text' | 'image' | 'video' | 'media'

/**
 * Artifact（代码/图表等）类型 - 权威定义
 * 被 store/taskStore.ts 引用，避免重复定义
 */
export interface Artifact {
  id: string  // 唯一标识符
  type: ArtifactType
  language?: string
  content: string
  source?: string
  title?: string  // Artifact 的自定义标题
  timestamp?: string  // 创建时间
  // 以下字段由 taskStore 扩展
  sortOrder?: number
  createdAt?: string
  isStreaming?: boolean  // 标记是否正在流式生成中
  isPreview?: boolean  // 🔥 标记为预览 artifact，禁止编辑
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
    timestamp: apiMessage.timestamp ? String(apiMessage.timestamp) : undefined
  }
}

// ============================================
// MCP 服务器相关类型
// ============================================

export type {
  MCPServer,
  MCPServerCreate,
  MCPServerUpdate,
  MCPConnectionStatus
} from './mcp'

/**
 * 将数据库消息转换为 UI 消息
 */
export function dbMessageToMessage(dbMessage: DBMessage): Message {
  const message: Message = {
    id: dbMessage.id ? String(dbMessage.id) : undefined,
    role: dbMessage.role,
    content: dbMessage.content,
    timestamp: dbMessage.timestamp ? String(dbMessage.timestamp) : undefined
  }

  // 处理 thinking 数据（类似 DeepSeek Chat 的思考过程）
  if (dbMessage.extra_data?.thinking?.steps && dbMessage.extra_data.thinking.steps.length > 0) {
    message.metadata = {
      thinking: dbMessage.extra_data.thinking.steps
    }
  }

  return message
}
