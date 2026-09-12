// 统一类型定义文件
// 消除类型定义分散的问题

import type { AnyServerEvent } from './events'

// ============================================
// 消息相关类型
// ============================================

/**
 * 用户消息附件元数据（后端消息 extra_data 透传，气泡 chips 渲染用）。
 * 文档只留名字（解析文本留在后端供上下文重建），图片只记数量不落库。
 */
export interface MessageAttachmentData {
  documents?: { name: string }[]
  image_count?: number
}

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
  extra_data?: MessageAttachmentData
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
  /** 发起该消息的会话 ID（P4-1 会话归属守卫：切换会话后不再追加旧会话消息） */
  threadId?: string
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

// ============================================
// 会话相关类型
// ============================================

/**
 * 会话类型枚举
 */
export type ConversationAgentType = 'default' | 'custom' | 'ai'

/**
 * 产物中心：跨会话产物列表项
 * 列表接口只带 content_preview；详情接口返回完整 content
 */
export interface ArtifactListItem {
  id: string
  thread_id?: string | null
  type: string
  title?: string | null
  language?: string | null
  sort_order?: number
  content?: string
  content_preview?: string
  content_length?: number
  sub_task_id?: string
  created_at?: string | null
}

/** 产物分页列表响应 */
export interface PaginatedArtifacts {
  items: ArtifactListItem[]
  total: number
  page: number
  limit: number
  pages: number
}

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
  latest_run?: AgentRunSummary
}

export interface AgentRunSummary {
  id: string
  status: string
  current_node?: string | null
  created_at?: string
  updated_at?: string
  last_heartbeat_at?: string | null
  completed_at?: string | null
}

export interface StreamRuntimeMeta {
  threadId?: string
  runId?: string
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
  depends_on?: string[]
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
    role: 'user' | 'admin'  // 用户角色（与后端 UserRole 一致；v3.4.7 双角色收敛）
    created_at?: string  // 注册时间（/user/me 提供）
    updated_at: string  // 用户信息更新时间戳，用于同步
    has_password?: boolean  // 是否已设置密码（决定修改密码时是否要求旧密码）
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
  expertEvent?: AnyServerEvent,
  artifact?: Artifact,
  expertId?: string,
  runtimeMeta?: StreamRuntimeMeta
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

// ============================================
// 类型守卫函数
// ============================================
// （v3.4.4 清理：isValidMessageRole / isValidApiMessageRole /
//   apiMessageToMessage / dbMessageToMessage 零消费者已移除）


// ============================================
// MCP 服务器相关类型
// ============================================

export type {
  MCPServer,
  MCPServerCreate,
  MCPServerUpdate,
  MCPConnectionStatus
} from './mcp'

// ============================================
// Run 相关类型（运行时间线）
// ============================================

export type {
  RunEventType,
  RunStatus,
  RunEvent,
  RunSummary,
  RunTimelineResponse,
  ThreadTimelineResponse,
} from './run'

export {
  TERMINAL_EVENTS,
  ACTIVE_RUN_STATUSES,
  isTerminalEvent,
  isRunActive,
  getEventCategory,
  getEventDisplayName,
} from './run'
