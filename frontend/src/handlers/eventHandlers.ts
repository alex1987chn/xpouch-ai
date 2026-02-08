/**
 * SSE 事件处理器
 * 连接后端 SSE 事件和前端 Store 状态更新
 */

import { useTaskStore } from '@/store/taskStore'
import { useChatStore } from '@/store/chatStore'
import type {
  AnyServerEvent,
  PlanCreatedEvent,
  TaskStartedEvent,
  TaskCompletedEvent,
  TaskFailedEvent,
  ArtifactGeneratedEvent,
  MessageDeltaEvent,
  MessageDoneEvent,
  RouterDecisionEvent,
  ErrorEvent
} from '@/types/events'
import { logger } from '@/utils/logger'

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

    // 根据事件类型分发处理
    switch (event.type) {
      case 'plan.created':
        this.handlePlanCreated(event as PlanCreatedEvent)
        break
      case 'task.started':
        this.handleTaskStarted(event as TaskStartedEvent)
        break
      case 'task.completed':
        this.handleTaskCompleted(event as TaskCompletedEvent)
        break
      case 'task.failed':
        this.handleTaskFailed(event as TaskFailedEvent)
        break
      case 'artifact.generated':
        this.handleArtifactGenerated(event as ArtifactGeneratedEvent)
        break
      case 'message.delta':
        this.handleMessageDelta(event as MessageDeltaEvent)
        break
      case 'message.done':
        this.handleMessageDone(event as MessageDoneEvent)
        break
      case 'router.decision':
        this.handleRouterDecision(event as RouterDecisionEvent)
        break
      case 'error':
        this.handleError(event as ErrorEvent)
        break
      default:
        logger.warn('[EventHandler] 未知事件类型:', (event as any).type)
    }
  }

  /**
   * 处理 plan.created 事件
   * 初始化任务计划
   */
  private handlePlanCreated(event: PlanCreatedEvent): void {
    const { initializePlan } = useTaskStore.getState()
    initializePlan(event.data)

    if (DEBUG) {
      logger.debug('[EventHandler] 任务计划已初始化:', event.data.session_id)
    }
  }

  /**
   * 处理 task.started 事件
   * 更新任务状态为 running
   * 注意：thinking 更新由 useExpertHandler.ts 处理，避免重复
   */
  private handleTaskStarted(event: TaskStartedEvent): void {
    const { startTask } = useTaskStore.getState()
    startTask(event.data)

    if (DEBUG) {
      logger.debug('[EventHandler] 任务开始:', event.data.task_id)
    }
  }

  /**
   * 处理 task.completed 事件
   * 更新任务状态为 completed
   * 注意：thinking 更新由 useExpertHandler.ts 处理，避免重复
   */
  private handleTaskCompleted(event: TaskCompletedEvent): void {
    const { completeTask } = useTaskStore.getState()
    completeTask(event.data)

    if (DEBUG) {
      logger.debug('[EventHandler] 任务完成:', event.data.task_id)
    }
  }

  /**
   * 处理 task.failed 事件
   * 更新任务状态为 failed
   * 注意：thinking 更新由 useExpertHandler.ts 处理，避免重复
   */
  private handleTaskFailed(event: TaskFailedEvent): void {
    const { failTask } = useTaskStore.getState()
    failTask(event.data)

    logger.error('[EventHandler] 任务失败:', event.data.task_id, event.data.error)
  }

  /**
   * 处理 artifact.generated 事件
   * 添加产物到对应任务
   */
  private handleArtifactGenerated(event: ArtifactGeneratedEvent): void {
    const { addArtifact } = useTaskStore.getState()
    addArtifact(event.data)

    if (DEBUG) {
      logger.debug(
        '[EventHandler] 产物已添加:',
        event.data.artifact.id,
        event.data.artifact.type
      )
    }
  }

  /**
   * 处理 message.delta 事件
   * 流式更新消息内容
   */
  private handleMessageDelta(event: MessageDeltaEvent): void {
    const { updateMessage, addMessage, messages } = useChatStore.getState()

    // 查找消息（前端应该在 useChatCore 中已经创建空消息）
    let message = messages.find((m) => m.id === event.data.message_id)

    if (!message) {
      // v3.1: 如果找不到消息（例如复杂模式下 aggregator 延迟），自动创建消息
      if (DEBUG) logger.debug('[EventHandler] message.delta: 消息不存在，自动创建:', event.data.message_id)
      
      // 创建新消息
      addMessage({
        id: event.data.message_id,
        role: 'assistant',
        content: event.data.content,
        timestamp: Date.now()
      })
      return
    }

    // 更新现有消息（追加增量内容）
    updateMessage(event.data.message_id, event.data.content, true)

    if (DEBUG) {
      logger.debug('[EventHandler] message.delta: 更新消息成功', event.data.message_id)
    }
  }

  /**
   * 处理 message.done 事件
   * 完成消息流式输出
   */
  private handleMessageDone(event: MessageDoneEvent): void {
    const { updateMessage, updateMessageMetadata, messages } = useChatStore.getState()

    // 查找消息
    const message = messages.find(m => m.id === event.data.message_id)

    if (DEBUG) {
      logger.debug('[EventHandler] message.done: 消息ID', event.data.message_id, '找到消息:', !!message, '内容长度:', event.data.full_content?.length)
    }

    if (!message) {
      logger.warn('[EventHandler] message.done: 找不到消息:', event.data.message_id)
      return
    }

    // 更新消息为最终内容
    updateMessage(event.data.message_id, event.data.full_content, false)

    // 🔥 修复：合并 thinking 数据，而不是覆盖
    // 优先使用前端累积的 thinking，后端返回的作为补充
    if (event.data.thinking && event.data.thinking.steps && event.data.thinking.steps.length > 0) {
      const existingThinking = message.metadata?.thinking || []
      const newSteps = event.data.thinking.steps
      
      // 合并：保留现有步骤，添加后端返回的新步骤（去重）
      const existingIds = new Set(existingThinking.map((s: any) => s.id))
      const mergedThinking = [
        ...existingThinking,
        ...newSteps.filter((s: any) => !existingIds.has(s.id))
      ]
      
      updateMessageMetadata(event.data.message_id, {
        thinking: mergedThinking
      })
      
      if (DEBUG) {
        logger.debug('[EventHandler] 合并 thinking 数据，前端:', existingThinking.length, '后端:', newSteps.length, '合并后:', mergedThinking.length)
      }
    }

    if (DEBUG) {
      logger.debug('[EventHandler] 消息完成:', event.data.message_id)
    }
  }

  /**
   * 处理 router.decision 事件
   * v3.0: 设置模式，触发 UI 切换
   * 🔥 注意：不再在这里移除空消息，交给 ChatStreamPanel 的过滤逻辑处理
   * 避免误删将要添加 thinking 数据的消息
   */
  private handleRouterDecision(event: RouterDecisionEvent): void {
    const { setMode } = useTaskStore.getState()

    // 设置模式（simple 或 complex）
    setMode(event.data.decision)

    if (DEBUG) {
      logger.debug('[EventHandler] 路由决策，设置模式:', event.data.decision)
    }
  }

  /**
   * 处理 error 事件
   * 记录错误
   */
  private handleError(event: ErrorEvent): void {
    logger.error('[EventHandler] 服务器错误:', event.data.code, event.data.message)

    // 可以在这里显示错误提示
    // toast.error(`错误: ${event.data.message}`)
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
