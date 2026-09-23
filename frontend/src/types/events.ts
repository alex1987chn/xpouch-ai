/**
 * SSE 事件类型定义
 * 统一前后端事件协议（与 backend/types/events.py 对应）
 */

import type { TaskStatus } from './enums.generated'


// ============================================================================
// 事件类型枚举
// ============================================================================

export type EventType =
  // 规划阶段
  | 'plan.created'
  | 'plan.started'    // 🔥 新增：规划开始
  | 'plan.thinking'   // 🔥 新增：规划思考流式内容
  // 任务执行阶段
  | 'task.started'
  | 'task.progress'
  | 'task.completed'
  | 'task.failed'
  // 工具调用（任务执行期间的可见性）
  | 'tool.calling'
  | 'tool.result'
  // 产物阶段 (v3.2.0: 仅保留批处理模式 artifact.generated)
  | 'artifact.generated'
  // 消息阶段
  | 'message.delta'
  | 'message.thinking'  // 🔥 新增：模型思考过程流式块（reasoning_content）
  | 'message.done'
  // 🔥🔥🔥 v3.1.0 HITL: 人类审核中断事件
  | 'human.interrupt'
  // 系统事件
  | 'router.start'
  | 'router.decision'
  | 'error'

// ============================================================================
// 基础事件结构
// ============================================================================

export interface SSEEvent<T = unknown, K extends EventType = EventType> {
  id: string
  timestamp: string
  type: K
  data: T
}

// ============================================================================
// 规划阶段事件
// ============================================================================

export interface TaskInfo {
  id: string
  expert_type: string
  description: string
  sort_order: number
  status: TaskStatus
  depends_on?: string[]
}

export interface PlanCreatedData {
  execution_plan_id: string
  summary: string
  estimated_steps: number
  execution_mode: 'sequential' | 'parallel'
  tasks: TaskInfo[]
  /** 思考载体消息的库内 id：前端把本地占位消息改写成它（两态同源锚点） */
  message_id?: number | null
}

export type PlanCreatedEvent = SSEEvent<PlanCreatedData, 'plan.created'>

// 🔥 新增：Commander 流式思考事件数据类型

export interface PlanStartedData {
  execution_plan_id: string
  title: string
  content: string
  status: 'running'
}

export interface PlanThinkingData {
  execution_plan_id: string
  delta: string
}

export type PlanStartedEvent = SSEEvent<PlanStartedData, 'plan.started'>
export type PlanThinkingEvent = SSEEvent<PlanThinkingData, 'plan.thinking'>

// ============================================================================
// 任务执行阶段事件
// ============================================================================

export interface TaskStartedData {
  task_id: string
  expert_type: string
  description: string
  started_at: string
  /** 专家消息 id（消息表=执行状态真相源）；空=后端插入失败，前端不加消息 */
  message_id?: number | null
  sort_order?: number | null
  total_steps?: number | null
}


export type TaskStartedEvent = SSEEvent<TaskStartedData, 'task.started'>

export interface TaskCompletedData {
  task_id: string
  expert_type: string
  description: string
  status: 'completed'
  output?: string | null
  duration_ms: number
  completed_at: string
  artifact_count: number
  /** 消息终态载荷：前端用它覆盖同 id 的专家消息（与库一致） */
  message_id?: number | null
  artifact_ids?: string[]
  tool_stats?: Record<string, number> | null
  /** 逐次工具调用明细（完成时刻快照；真相源=账本） */
  tool_calls?: Record<string, unknown>[] | null
  /** 产出标题（与 artifact.title 同源）——横条/摘要行用它，不用 output 首行 */
  summary?: string | null
}

export type TaskCompletedEvent = SSEEvent<TaskCompletedData, 'task.completed'>

export interface TaskFailedData {
  task_id: string
  expert_type: string
  description: string
  error: string
  failed_at: string
  message_id?: number | null
}

export type TaskFailedEvent = SSEEvent<TaskFailedData, 'task.failed'>

// ============================================================================
// 工具调用事件（任务执行期间）
// ============================================================================

export interface ToolCallingData {
  task_id: string
  expert_type: string
  tool: string
  source: 'builtin' | 'mcp'
  args_summary: string
  attempt: number
}

export type ToolCallingEvent = SSEEvent<ToolCallingData, 'tool.calling'>

export interface ToolResultData {
  task_id: string
  expert_type: string
  tool: string
  source: 'builtin' | 'mcp'
  success: boolean
  duration_ms: number
  error?: string | null
}

export type ToolResultEvent = SSEEvent<ToolResultData, 'tool.result'>

// ============================================================================
// 任务进度事件（可选）
// ============================================================================

export interface TaskProgressData {
  task_id: string
  expert_type: string
  progress: number // 0.0 - 1.0
  message?: string | null // 进度消息，如"正在搜索..."
}

export type TaskProgressEvent = SSEEvent<TaskProgressData, 'task.progress'>

// ============================================================================
// 产物阶段事件
// ============================================================================

export interface ArtifactInfo {
  id: string
  /** 产物类型（code / markdown / report / sql / chart / image / html / search / media / video / text / json）。
   *  此前这里只列了 5 种字面量，而产物实际有 12 类——是前端自己的类型谎言，已放宽为 string；
   *  类型名与配色由 lib/artifactPresentation 负责。 */
  type: string
  title?: string | null
  content: string
  language?: string | null
  sort_order: number
}

export interface ArtifactGeneratedData {
  task_id: string
  expert_type: string
  artifact: ArtifactInfo
}

export type ArtifactGeneratedEvent = SSEEvent<ArtifactGeneratedData, 'artifact.generated'>

// ============================================================================
// 消息阶段事件
// ============================================================================

export interface MessageDeltaData {
  message_id: string
  content: string
  is_final?: boolean
}

export type MessageDeltaEvent = SSEEvent<MessageDeltaData, 'message.delta'>

export interface MessageThinkingData {
  message_id: string
  /** 思考增量内容（模型 reasoning_content） */
  content: string
}

export type MessageThinkingEvent = SSEEvent<MessageThinkingData, 'message.thinking'>

export interface MessageDoneData {
  message_id: string
  full_content: string
  total_tokens?: number | null
  thinking?: Generated.ThinkingData | null  // 思考过程数据（类似 DeepSeek Chat）
}

export type MessageDoneEvent = SSEEvent<MessageDoneData, 'message.done'>

// ============================================================================
// 系统事件
// ============================================================================

export interface RouterStartData {
  query: string
  timestamp: string
}

export type RouterStartEvent = SSEEvent<RouterStartData, 'router.start'>

export interface RouterDecisionData {
  decision: 'simple' | 'complex'
  reason?: string | null
}

export type RouterDecisionEvent = SSEEvent<RouterDecisionData, 'router.decision'>

export interface ErrorData {
  code: string
  message: string
  details?: Record<string, unknown> | null
}

export type ErrorEvent = SSEEvent<ErrorData, 'error'>

// ============================================================================
// 🔥🔥🔥 v3.1.0 HITL: 人类审核中断事件
// ============================================================================

export interface HumanInterruptData {
  type: 'plan_review'
  run_id?: string | null
  execution_plan_id?: string | null
  plan_version: number
  current_plan: Generated.PlanTaskPayload[]
}

export type HumanInterruptEvent = SSEEvent<HumanInterruptData, 'human.interrupt'>

// ============================================================================
// 协议一致性闸门（决定 6）
//
// 真相源是后端的 pydantic 事件模型（backend/event_types/events.py），由
// backend/scripts/gen_event_types_ts.py 生成 events.generated.ts，后端另有 pytest
// 断言该生成物始终最新。下面这组断言挡住**最伤人的那一类漂移**：前端声明了后端
// 根本不发送的字段（字段改名/删除后前端照样编译、运行期读到 undefined）。
// 真出现过：TaskInfo 的 depends_on 前端一直有、后端一直没发。
//
// 尚未覆盖（已知缺口，写进 docs/TARGET-ARCHITECTURE.md 决定 6）：
// - null 与 undefined 的语义差（后端 `str | None` 生成 `x?: string | null`，前端
//   多写成 `x?: string`）——对齐它要动一批消费点的空值处理；
// - 前端把字段收窄成字面量联合（如 ArtifactInfo.type 只列 5 种，实际产物类型有
//   12 种）——那是前端自己的类型债，另行修。
// ============================================================================

import type * as Generated from './events.generated'

/** 编译期断言：T 必须为 true，否则 tsc 报错 */
type Assert<T extends true> = T
/**
 * 双向相等：手写类型与后端生成类型**逐字段一致**（含可选性与 null）。
 * 这比「字段子集」严得多——字段类型被改窄/加 null/换名字都会在这里红。
 */
type SameShape<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false

type _TaskInfo = Assert<SameShape<TaskInfo, Generated.TaskInfo>>
type _PlanCreated = Assert<SameShape<PlanCreatedData, Generated.PlanCreatedData>>
type _PlanStarted = Assert<SameShape<PlanStartedData, Generated.PlanStartedData>>
type _PlanThinking = Assert<SameShape<PlanThinkingData, Generated.PlanThinkingData>>
type _TaskStarted = Assert<SameShape<TaskStartedData, Generated.TaskStartedData>>
type _TaskProgress = Assert<SameShape<TaskProgressData, Generated.TaskProgressData>>
type _TaskCompleted = Assert<SameShape<TaskCompletedData, Generated.TaskCompletedData>>
type _TaskFailed = Assert<SameShape<TaskFailedData, Generated.TaskFailedData>>
type _ToolCalling = Assert<SameShape<ToolCallingData, Generated.ToolCallingData>>
type _ToolResult = Assert<SameShape<ToolResultData, Generated.ToolResultData>>
type _ArtifactInfo = Assert<SameShape<ArtifactInfo, Generated.ArtifactInfo>>
type _ArtifactGenerated = Assert<SameShape<ArtifactGeneratedData, Generated.ArtifactGeneratedData>>
type _MessageDelta = Assert<SameShape<MessageDeltaData, Generated.MessageDeltaData>>
type _MessageThinking = Assert<SameShape<MessageThinkingData, Generated.MessageThinkingData>>
type _MessageDone = Assert<SameShape<MessageDoneData, Generated.MessageDoneData>>
type _RouterStart = Assert<SameShape<RouterStartData, Generated.RouterStartData>>
type _RouterDecision = Assert<SameShape<RouterDecisionData, Generated.RouterDecisionData>>
type _Error = Assert<SameShape<ErrorData, Generated.ErrorData>>
type _HumanInterrupt = Assert<SameShape<HumanInterruptData, Generated.HumanInterruptData>>

/** 上面这组断言只做编译期校验，导出以免被 noUnusedLocals 误报 */
export type ProtocolConformanceAnchors = [
  _TaskInfo,
  _PlanCreated,
  _PlanStarted,
  _PlanThinking,
  _TaskStarted,
  _TaskProgress,
  _TaskCompleted,
  _TaskFailed,
  _ToolCalling,
  _ToolResult,
  _ArtifactInfo,
  _ArtifactGenerated,
  _MessageDelta,
  _MessageThinking,
  _MessageDone,
  _RouterStart,
  _RouterDecision,
  _Error,
  _HumanInterrupt,
]

// ============================================================================
// 联合类型
// ============================================================================

export type AnyServerEvent =
  | PlanCreatedEvent
  | PlanStartedEvent      // 🔥 新增
  | PlanThinkingEvent     // 🔥 新增
  | TaskStartedEvent
  | TaskProgressEvent     // 🔥 新增
  | TaskCompletedEvent
  | TaskFailedEvent
  | ToolCallingEvent
  | ToolResultEvent
  | ArtifactGeneratedEvent
  | MessageDeltaEvent
  | MessageThinkingEvent  // 🔥 新增：模型思考过程流式块
  | MessageDoneEvent
  | HumanInterruptEvent     // 🔥🔥🔥 v3.1.0 HITL
  | RouterStartEvent
  | RouterDecisionEvent
  | ErrorEvent
