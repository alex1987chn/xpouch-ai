/**
 * 前端本地运行时类型（UI 形状）——与线上传输形状分居（2026-09-26 拆分）。
 *
 * [为什么分居] types/index.ts 此前线上形状与本地扩展混居：ThinkingStep/
 * toolCalls/isStreaming 这类"纯前端运行时态"（思考步骤不入库、工具活动
 * 实时累积）与 REST 契约锚点写在同一个文件里，改字段时分不清哪边会波及
 * 后端契约。此文件只放**前端自己发明**的形状；线上形状与锚点留在 index.ts。
 *
 * index.ts 对本文件做 barrel re-export，消费端 import 路径不变。
 */

import type { ToolCallRecord } from './index'

/**
 * 思考过程步骤（纯前端：思考不入库，刷新后由 runevent 账本重建挂回载体行）
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
  type?: 'search' | 'reading' | 'analysis' | 'coding' | 'planning' | 'writing' | 'artifact' | 'memory' | 'default'
  /**
   * 执行耗时（毫秒）
   */
  duration?: number
  /**
   * 该步骤产出的产物引用（用于步骤下方的内联卡片）。
   * 只存渲染所需的最小字段；正文由 ArtifactViewerModal 按 id 取详情，
   * 避免把产物内容复制进消息元数据。
   */
  artifacts?: { id: string; type: string; title?: string | null }[]
  /**
   * 相关 URL（如 reading 类型时的网页链接）
   */
  url?: string
}

/**
 * 消息元数据（用于专家任务等）——纯前端运行时袋：
 * thinking（本地重建）、threadId（会话归属守卫）、toolCalls（实时累积，
 * 完成后由 extra_data.tool_calls / tool_stats 终态取代渲染）
 */
export interface MessageMetadata {
  type?: 'task_plan' | 'task_start' | 'expert_completion'
  expertId?: string
  thinking?: ThinkingStep[]
  reasoningContent?: string
  /** 发起该消息的会话 ID（P4-1 会话归属守卫：切换会话后不再追加旧会话消息） */
  threadId?: string
  /** 专家消息（extra_data.message_kind='expert_result'）执行期间的工具活动序列 */
  toolCalls?: ToolCallRecord[]
}

/** 流式回调的运行时上下文（前端附加，非线上字段） */
export interface StreamRuntimeMeta {
  threadId?: string
  runId?: string
}

/**
 * SSE 流式回调类型（前端消费协议）
 */
export type StreamCallback = (
  chunk: string | undefined,
  threadId?: string,
  expertEvent?: import('./events').AnyServerEvent,
  artifact?: import('./index').Artifact,
  expertId?: string,
  runtimeMeta?: StreamRuntimeMeta
) => Promise<void> | void
