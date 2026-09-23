/**
 * SSE 事件处理器 - 统一导出
 * 
 * [架构 v3.2.0]
 * chat.ts (SSE 连接) -> EventHandler -> Stores -> React Components
 * 
 * [事件分发]
 * - message.* 事件 -> chat.ts onChunk -> ChatStore (流式对话)
 * - plan/task/artifact 事件 -> EventHandler -> TaskStore (批处理)
 * 
 * [去重机制]
 * - 使用 processedEventIds Set 去重，**作用域是 run**（见 UNKNOWN_RUN_SCOPE 说明）
 * - 限制存储数量（防内存泄漏）
 */

import { useTaskStore } from '@/store/taskStore'
import { useChatStore } from '@/store/chatStore'
import type { AnyServerEvent } from './types'
import { logger } from '@/utils/logger'

// 导入各个事件处理器
import {
  handlePlanCreated,
  handlePlanStarted,
  handlePlanThinking,
  handleTaskStarted,
  handleTaskProgress,
  handleTaskCompleted,
  handleTaskFailed
} from './taskEvents'
import { handleArtifactGenerated } from './artifactEvents'
import { handleMessageDelta, handleMessageDone, handleMessageThinking } from './chatEvents'
import {
  handleRouterStart,
  handleRouterDecision,
  handleHumanInterrupt,
  handleError
} from './systemEvents'

// 开发环境判断
const DEBUG = import.meta.env.VITE_DEBUG_MODE === 'true'

/**
 * 去重的作用域是 **run**，不是页面。
 *
 * 服务端的 SSE 帧 id 是 **run 级**的 seq（`frame_recorder.reserve_seq`：每个 run 都从
 * 1 开始，进程重启后从库里续号）。这里此前是全页面共用一个 Set，于是同一标签页里
 * 第二个 run 的 seq 1..N 会和上一个 run 的 1..N 撞 id，被当成重复**静默丢弃**——
 * 实测后果（2026-09-13）：同页第二个复杂任务的头部帧全丢（router/plan/human.interrupt
 * 依次在内），表现为「跑完复杂任务，审批卡不出现」「点会话记录打开像空会话」，
 * 硬刷即好（新页面 = 空集合）。把 run 并进 key 即可根治。
 *
 * 同一 run 内仍然去重：补放与实时跟随的重叠窗口里，同一个 seq 可能到两次
 * （客户端 seq 游标是第一道保险，这个 Set 是第二道）——那是它本来要拦的东西，
 * 不能顺手删掉。
 *
 * `UNKNOWN_RUN_SCOPE`：调用方拿不到 run id 时（例如直接调用本模块的测试）共用一个
 * 命名空间，退化成改动前的行为。
 */
export const UNKNOWN_RUN_SCOPE = 'unknown-run'

// ============================================================================
// 事件处理器类
// ============================================================================

export class EventHandler {
  private processedEventIds = new Set<string>()

  /**
   * 处理单个 SSE 事件
   *
   * @param runScope 该事件所属 run 的 id（见 UNKNOWN_RUN_SCOPE 的说明）。
   *   同一 run 的帧才去重——帧 id 是 run 级 seq，跨 run 会重号。
   */
  handle(event: AnyServerEvent, runScope: string = UNKNOWN_RUN_SCOPE): void {
    // 去重检查（key 必须带 run：帧 id 是 run 级 seq，会跨 run 重号）
    const dedupeKey = `${runScope}:${event.id}`
    if (this.processedEventIds.has(dedupeKey)) {
      if (DEBUG) logger.debug('[EventHandler] 跳过重复事件:', dedupeKey)
      return
    }
    this.processedEventIds.add(dedupeKey)

    // 限制已处理事件数量（防止内存泄漏）
    if (this.processedEventIds.size > 1000) {
      const first = this.processedEventIds.values().next().value
      if (first !== undefined) {
        this.processedEventIds.delete(first)
      }
    }

    if (DEBUG) {
      logger.debug('[EventHandler] 处理事件:', event.type, event.id)
    }

    // 构建上下文
    const context = {
      taskStore: useTaskStore.getState(),
      chatStore: useChatStore.getState(),
      debug: DEBUG
    }

    // 根据事件类型分发处理
    switch (event.type) {
      case 'router.start':
        handleRouterStart(event, context)
        break
      case 'plan.created':
        handlePlanCreated(event, context)
        break
      case 'plan.started':
        handlePlanStarted(event, context)
        break
      case 'plan.thinking':
        handlePlanThinking(event, context)
        break
      case 'task.started':
        handleTaskStarted(event, context)
        break
      case 'task.progress':
        handleTaskProgress(event, context)
        break
      case 'task.completed':
        handleTaskCompleted(event, context)
        break
      case 'task.failed':
        handleTaskFailed(event, context)
        break
      case 'tool.calling':
      case 'tool.result':
        // 工具可见性事件：持久帧/时间线已消费（tool_result 入账本）；
        // 聊天页任务卡的实时工具行待定——先显式吸收，避免 default 的 warn 噪音
        logger.debug('[EventHandler] 工具事件:', event.type, (event as { data?: unknown }).data)
        break
      case 'artifact.generated':
        handleArtifactGenerated(event, context)
        break
      case 'message.delta':
        handleMessageDelta(event, context)
        break
      case 'message.thinking':
        handleMessageThinking(event, context)
        break
      case 'message.done':
        handleMessageDone(event, context)
        break
      case 'human.interrupt':
        handleHumanInterrupt(event, context)
        break
      case 'router.decision':
        handleRouterDecision(event, context)
        break
      case 'error':
        handleError(event, context)
        break
      default:
        logger.warn('[EventHandler] 未知事件类型:', (event as { type?: string }).type)
    }
  }

  /**
   * 清空已处理事件记录
   */
  clearProcessedEvents(): void {
    this.processedEventIds.clear()
  }
}

// ============================================================================
// 单例实例
// ============================================================================

let eventHandlerInstance: EventHandler | null = null

export function getEventHandler(): EventHandler {
  if (!eventHandlerInstance) {
    eventHandlerInstance = new EventHandler()
  }
  return eventHandlerInstance
}

// ============================================================================
// 便捷函数
// ============================================================================

/**
 * 处理 SSE 事件（便捷函数）
 *
 * @param runScope 事件所属 run 的 id；调用方已知就传，未知可省（退化为单一命名空间）
 */
export function handleServerEvent(event: AnyServerEvent, runScope?: string): void {
  getEventHandler().handle(event, runScope)
}


// ============================================================================
// 处理器函数导出（便于单元测试）
// ============================================================================

export {
  handlePlanCreated,
  handlePlanStarted,
  handlePlanThinking,
  handleTaskStarted,
  handleTaskProgress,
  handleTaskCompleted,
  handleTaskFailed
} from './taskEvents'

export { handleArtifactGenerated } from './artifactEvents'

export { handleMessageDelta, handleMessageDone, clearProcessedMessageDones, clearProcessedMessageDone } from './chatEvents'

export {
  handleRouterStart,
  handleRouterDecision,
  handleHumanInterrupt,
  handleError
} from './systemEvents'

export { getLastAssistantMessage } from './utils'
