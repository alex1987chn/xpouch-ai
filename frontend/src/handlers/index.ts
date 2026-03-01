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
 * - 使用 processedEventIds Set 去重
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
  handleTaskCompleted,
  handleTaskFailed
} from './taskEvents'
import { handleArtifactGenerated } from './artifactEvents'
import { handleMessageDelta, handleMessageDone } from './chatEvents'
import {
  handleRouterStart,
  handleRouterDecision,
  handleHumanInterrupt,
  handleError
} from './systemEvents'

// 开发环境判断
const DEBUG = import.meta.env.VITE_DEBUG_MODE === 'true'

// ============================================================================
// 事件处理器类
// ============================================================================

export class EventHandler {
  private processedEventIds = new Set<string>()

  /**
   * 处理单个 SSE 事件
   */
  handle(event: AnyServerEvent): void {
    // 去重检查
    if (this.processedEventIds.has(event.id)) {
      if (DEBUG) logger.debug('[EventHandler] 跳过重复事件:', event.id)
      return
    }
    this.processedEventIds.add(event.id)

    // 限制已处理事件数量（防止内存泄漏）
    if (this.processedEventIds.size > 1000) {
      const first = this.processedEventIds.values().next().value
      this.processedEventIds.delete(first)
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
      case 'task.completed':
        handleTaskCompleted(event, context)
        break
      case 'task.failed':
        handleTaskFailed(event, context)
        break
      case 'artifact.generated':
        handleArtifactGenerated(event, context)
        break
      case 'message.delta':
        handleMessageDelta(event, context)
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
        logger.warn('[EventHandler] 未知事件类型:', (event as any).type)
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
 */
export function handleServerEvent(event: AnyServerEvent): void {
  getEventHandler().handle(event)
}

/**
 * 批量处理 SSE 事件
 */
export function handleServerEvents(events: AnyServerEvent[]): void {
  const handler = getEventHandler()
  events.forEach((event) => handler.handle(event))
}

/**
 * 清空事件处理器状态
 */
export function clearEventHandler(): void {
  getEventHandler().clearProcessedEvents()
}

// ============================================================================
// 类型导出（保持向后兼容）
// ============================================================================

export type {
  AnyServerEvent,
  PlanCreatedEvent,
  PlanStartedEvent,
  PlanThinkingEvent,
  TaskStartedEvent,
  TaskCompletedEvent,
  TaskFailedEvent,
  ArtifactGeneratedEvent,
  MessageDeltaEvent,
  MessageDoneEvent,
  HumanInterruptEvent,
  RouterStartEvent,
  RouterDecisionEvent,
  ErrorEvent,
  HandlerContext
} from './types'

// ============================================================================
// 处理器函数导出（便于单元测试）
// ============================================================================

export {
  handlePlanCreated,
  handlePlanStarted,
  handlePlanThinking,
  handleTaskStarted,
  handleTaskCompleted,
  handleTaskFailed
} from './taskEvents'

export { handleArtifactGenerated } from './artifactEvents'

export { handleMessageDelta, handleMessageDone, clearProcessedMessageDones } from './chatEvents'

export {
  handleRouterStart,
  handleRouterDecision,
  handleHumanInterrupt,
  handleError
} from './systemEvents'

export { getLastAssistantMessage } from './utils'
