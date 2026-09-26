// 统一类型定义文件
// 消除类型定义分散的问题

import type { components } from '@/types/api.generated'
// 本地运行时形状分居到 ui.ts（线上形状留本文件）；此处 import 供 Message
// 引用 + barrel re-export，消费端 import 路径不变
export type {
  MessageMetadata,
  StreamCallback,
  StreamRuntimeMeta,
  ThinkingStep,
} from './ui'
import type { MessageMetadata } from './ui'

// ============================================
// REST 契约锚点（本文件的 REST 形状类型逐个接锚点；范式沿 types/stats.ts）
// ============================================

/** 双向相等：手写类型与后端生成类型**逐字段一致**（含可选性与 null）。 */
type SameShape<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type Assert<T extends true> = T

type Schemas = components['schemas']

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
 * 专家执行消息的元数据（后端 message.extra_data，message_kind='expert_result'）。
 * 消息表是专家执行状态的一等真相源：task 开始插入 running 态，完成/失败原位
 * 更新；刷新会话直接从这里读，不再有前端拼装的中间态。
 */
/** 单次工具调用记录（服务端账本/快照与前端实时累积共用形状） */
export interface ToolCallRecord {
  tool: string
  duration_ms?: number
  success?: boolean
  source?: string
  /** 仅实时态：calling 尚在进行（终态快照无此字段） */
  status?: 'calling' | 'done'
}

export interface ExpertMessageData {
  message_kind: 'expert_result'
  expert_type: string
  task_id: string
  task_description: string
  sort_order: number
  total_steps: number
  status: 'running' | 'completed' | 'failed'
  artifact_ids?: string[]
  tool_stats?: { count: number; total_ms: number; failed: number } | null
  /** 逐次工具调用明细（完成时刻快照；刷新后从这里读） */
  tool_calls?: ToolCallRecord[] | null
  duration_ms?: number | null
  summary?: string | null
  error?: string | null
}

/**
 * 思考载体消息（后端 message.extra_data，message_kind='run_thinking'）：
 * 复杂执行轮的思考过程锚点行——commander 规划时插入、排在专家消息之前，
 * content 恒空（思考步骤不入库，刷新时由 runevent 账本重建挂回本条）。
 */
export interface RunThinkingData {
  message_kind: 'run_thinking'
  run_id?: string | null
}

/**
 * 基础消息接口 - 用于 UI 组件
 */
export interface Message {
  id?: string
  role: 'user' | 'assistant' | 'system'
  content: string
  isTyping?: boolean
  /** 本地运行时时间戳（前端创建时）；服务端消息的时间字段是 created_at */
  timestamp?: number | string
  /** 服务端落库时间（历史消息；词汇收敛后 timestamp 已退役为本地字段） */
  created_at?: string | null
  metadata?: MessageMetadata
  extra_data?: MessageAttachmentData | ExpertMessageData | RunThinkingData
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
export type ThreadAgentType = 'default' | 'custom' | 'ai'

/**
 * 产物中心：跨会话产物列表项
 * 列表接口只带 content_preview；详情接口返回完整 content
 */
/**
 * 产物中心列表项：基座 = 列表 schema（ArtifactSummaryResponse，SameShape
 * 锚定）；`content` / `sub_task_id` 为详情模式的**声明式扩展**（详情接口
 * 返回完整 content，见 ArtifactDetailResponse）——此前把两个 schema 手工
 * 揉成一个可选大杂烩，正是锚点要消灭的宽松漂移。
 */
export interface ArtifactListItem {
  id: string
  thread_id: string | null
  thread_title?: string | null
  type: string
  title: string | null
  language: string | null
  sort_order: number
  content_preview: string
  content_length: number
  created_at: string
  /** 详情模式扩展：完整内容（列表接口不返回） */
  content?: string
  /** 详情模式扩展 */
  sub_task_id?: string
}

/** 产物分页列表响应 */
export interface PaginatedArtifacts {
  items: ArtifactListItem[]
  total: number
  page: number
  limit: number
  pages: number
}

type _ArtifactListItem = Assert<
  SameShape<
    Pick<ArtifactListItem, Exclude<keyof ArtifactListItem, 'content' | 'sub_task_id'>>,
    Schemas['ArtifactSummaryResponse']
  >
>

/**
 * 会话列表项接口（轻量级，不包含消息内容）
 */
export interface Thread {
  id: string
  title: string
  agent_id: string
  agent_type?: ThreadAgentType
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
  // 以下均为后端必填可空字段（SameShape 锚点对齐，此前前端手写成可选=宽松漂移）
  current_node: string | null
  created_at: string | null
  updated_at: string | null
  last_heartbeat_at: string | null
  completed_at: string | null
  /** run 开始时间：`attachThinkingFromTimeline` 判定「这条助手消息是否由本次 run 产出」的依据 */
  started_at: string | null
}

type _AgentRunSummary = Assert<SameShape<AgentRunSummary, Schemas['AgentRunSummaryResponse']>>

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
  description: string
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
 *
 * SameShape 锚定后端 schemas/user_profile.py 的 UserProfileResponse
 * （REST 契约锚点范式见 types/stats.ts）。
 */
export interface UserProfile {
    id: string
    username: string
    avatar: string | null
    plan: string
    role: 'user' | 'admin'  // 用户角色（与后端 UserRole 一致；v3.4.7 双角色收敛）
    created_at: string | null  // 注册时间（/user/me 提供）
    updated_at: string | null  // 用户信息更新时间戳，用于同步
    has_password: boolean  // 是否已设置密码（决定修改密码时是否要求旧密码）
}

type _UserProfile = Assert<SameShape<UserProfile, Schemas['UserProfileResponse']>>

/** 锚点只做编译期校验，导出以免被 noUnusedLocals 误报 */
export type IndexConformanceAnchors = [_UserProfile, _AgentRunSummary, _ArtifactListItem]

// ============================================
// 会话相关类型
// ============================================
// StreamCallback / StreamRuntimeMeta / ThinkingStep / MessageMetadata
// 已分居到 ./ui.ts（本地运行时形状），经文件头 barrel re-export

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
