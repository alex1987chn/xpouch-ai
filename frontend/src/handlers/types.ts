/**
 * Event Handlers 共享类型定义
 * 
 * 注意：保持与原始 eventHandlers.ts 兼容
 */

import type { useTaskStore } from '@/store/taskStore'
import type { useChatStore } from '@/store/chatStore'
import type {
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
  ErrorEvent
} from '@/types/events'

// 导出事件类型（保持兼容）
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
  ErrorEvent
}

/**
 * Handler 上下文 - 每个处理器接收的统一上下文
 */
export interface HandlerContext {
  taskStore: ReturnType<typeof useTaskStore.getState>
  chatStore: ReturnType<typeof useChatStore.getState>
  debug: boolean
}

/**
 * 处理器函数类型
 */
export type EventHandlerFn<T extends AnyServerEvent = AnyServerEvent> = (
  event: T,
  context: HandlerContext
) => void

/**
 * 消息和ID的返回类型
 */
export interface LastAssistantMessageResult {
  message: any
  id: string
}

/**
 * 事件处理器注册表
 */
export type EventHandlerRegistry = Map<string, EventHandlerFn<any>>
