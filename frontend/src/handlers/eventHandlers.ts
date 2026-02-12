/**
 * SSE 事件处理器 - 全局事件分发中心
 *
 * [职责]
 * 处理后端推送的所有 SSE 事件，更新前端 Store 状态：
 * - 任务状态管理（TaskStore）
 * - 对话消息更新（ChatStore）
 * - Thinking Steps 构建
 *
 * [批处理模式重构]
 * - 移除 artifact.start/chunk/completed 流式事件处理
 * - 所有 Artifact 通过 artifact.generated 事件全量推送
 * - 添加进度更新逻辑
 * 
 * [架构]
 * chat.ts (SSE 连接) -> EventHandler -> Stores -> React Components
 *                      |
 *                      v
 *               useExpertHandler (可选，用于 Thinking 更新)
 * 
 * [事件分发]
 * 注意：plan.created 事件在 useExpertHandler 中处理（避免重复）
 * 其他事件在此统一处理
 * 
 * [去重机制]
 * - 使用 processedEventIds Set 去重
 * - 限制存储数量（防内存泄漏）
 * 
 * [处理的事件类型]
 * - router.*: 路由决策
 * - task.*: 任务状态变更
 * - artifact.generated: 产物生成（批处理）
 * - message.*: 流式消息
 * - human.interrupt: HITL 中断
 * 
 * [状态更新]
 * - TaskStore: 任务状态、Artifact 列表、进度
 * - ChatStore: 消息元数据（Thinking Steps）、消息内容
 */

import { useTaskStore } from '@/store/taskStore'
import { useChatStore } from '@/store/chatStore'
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
      case 'router.start':
        this.handleRouterStart(event as RouterStartEvent)
        break
      // 🔥 plan.created 已在 useExpertHandler 中处理（避免重复）
      // 保留 case 但不做任何操作
      case 'plan.created':
        break
      // 🔥 Commander 流式思考事件
      case 'plan.started':
        this.handlePlanStarted(event as PlanStartedEvent)
        break
      case 'plan.thinking':
        this.handlePlanThinking(event as PlanThinkingEvent)
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
      // 批处理模式 - 只处理 artifact.generated
      case 'artifact.generated':
        this.handleArtifactGenerated(event as ArtifactGeneratedEvent)
        break
      case 'message.delta':
        this.handleMessageDelta(event as MessageDeltaEvent)
        break
      case 'message.done':
        this.handleMessageDone(event as MessageDoneEvent)
        break
      // 🔥🔥🔥 v3.1.0 HITL: 人类审核中断事件
      case 'human.interrupt':
        this.handleHumanInterrupt(event as HumanInterruptEvent)
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

    // 🔥 更新 thinking 步骤为完成状态
    const { messages, updateMessageMetadata } = useChatStore.getState()
    const lastAiMessage = [...messages].reverse().find(m => m.role === 'assistant')
    
    if (lastAiMessage?.metadata?.thinking) {
      const thinking = [...lastAiMessage.metadata.thinking]
      const planStepIndex = thinking.findIndex(s => s.type === 'planning')
      if (planStepIndex >= 0) {
        thinking[planStepIndex] = {
          ...thinking[planStepIndex],
          status: 'completed',
          content: '任务规划完成'
        }
        updateMessageMetadata(lastAiMessage.id!, { thinking })
      }
    }

    if (DEBUG) {
      logger.debug('[EventHandler] 任务计划已初始化:', event.data.session_id)
    }
  }

  /**
   * 🔥 新增：处理 plan.started 事件
   * 创建 thinking step，title 常驻，content 初始为空
   */
  private handlePlanStarted(event: PlanStartedEvent): void {
    const { startPlan } = useTaskStore.getState()
    startPlan(event.data)

    // 🔥 创建 thinking step 到聊天消息
    const { messages, updateMessageMetadata } = useChatStore.getState()
    const lastAiMessage = [...messages].reverse().find(m => m.role === 'assistant')
    
    if (lastAiMessage) {
      const thinking = [...(lastAiMessage.metadata?.thinking || [])]
      
      // 创建新的 planning step
      // title: '任务规划' (expertName), content: '' (初始为空), status: 'running'
      const planStep = {
        id: `plan-${event.data.session_id}`,
        expertType: 'planner',
        expertName: '任务规划',  // 🔥 title 常驻
        content: '',  // 🔥 初始为空，不显示内容
        timestamp: new Date().toISOString(),
        status: 'running' as const,
        type: 'planning' as const
      }
      
      // 查找是否已存在规划步骤，避免重复
      const existingIndex = thinking.findIndex(s => s.type === 'planning')
      if (existingIndex >= 0) {
        // 复用现有 step，但重置 content
        thinking[existingIndex] = { ...thinking[existingIndex], ...planStep }
      } else {
        thinking.push(planStep)
      }
      
      updateMessageMetadata(lastAiMessage.id!, { thinking })
    }

    if (DEBUG) {
      logger.debug('[EventHandler] 规划开始，title 常驻:', event.data.session_id)
    }
  }

  /**
   * 🔥 新增：处理 plan.thinking 事件
   * 追加 delta 到 content 字段，不覆盖 title
   */
  private handlePlanThinking(event: PlanThinkingEvent): void {
    console.log('[EventHandler] 🧠 plan.thinking:', event.data.delta.substring(0, 30) + '...')
    
    const { appendPlanThinking } = useTaskStore.getState()
    appendPlanThinking(event.data)

    // 🔥 追加到 thinking step 的 content 字段
    const { messages, updateMessageMetadata } = useChatStore.getState()
    const lastAiMessage = [...messages].reverse().find(m => m.role === 'assistant')
    
    if (lastAiMessage?.metadata?.thinking) {
      const thinking = [...lastAiMessage.metadata.thinking]
      const planStepIndex = thinking.findIndex(s => s.type === 'planning')
      
      if (planStepIndex >= 0) {
        // 🔥 只更新 content，不覆盖 title (expertName)
        thinking[planStepIndex] = {
          ...thinking[planStepIndex],
          content: thinking[planStepIndex].content + event.data.delta
        }
        updateMessageMetadata(lastAiMessage.id!, { thinking })
        console.log('[EventHandler] ✅ thinking content 已更新')
      } else {
        console.warn('[EventHandler] ⚠️ 未找到 planning step')
      }
    } else {
      console.warn('[EventHandler] ⚠️ 最后一条消息没有 thinking 元数据')
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
   * 更新任务状态为 completed，并更新进度
   * 添加进度更新逻辑
   */
  private handleTaskCompleted(event: TaskCompletedEvent): void {
    const { completeTask, setProgress, tasksCache } = useTaskStore.getState()
    completeTask(event.data)

    // 🔥 更新进度
    const completedCount = tasksCache.filter(t => t.status === 'completed').length
    const totalCount = tasksCache.length
    if (totalCount > 0) {
      setProgress({ current: completedCount, total: totalCount })
    }

    if (DEBUG) {
      logger.debug('[EventHandler] 任务完成:', event.data.task_id, '进度:', completedCount, '/', totalCount)
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
   * 批处理模式 - 直接添加完整的 artifact
   * 添加产物到对应任务
   */
  private handleArtifactGenerated(event: ArtifactGeneratedEvent): void {
    const { addArtifact } = useTaskStore.getState()
    addArtifact(event.data)

    if (DEBUG) {
      logger.debug(
        '[EventHandler] 产物已添加:',
        event.data.artifact.id,
        event.data.artifact.type,
        '内容长度:',
        event.data.artifact.content?.length || 0
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

    // 🔥 修复：避免重复更新
    // message.delta 的更新已由 useChatCore.ts 中的 streamCallback 处理
    // 这里不再重复更新，避免内容双倍追加
    
    if (DEBUG) {
      logger.debug('[EventHandler] message.delta: 跳过更新（已由 useChatCore 处理）', event.data.message_id)
    }
  }

  // 🔥 防重：已处理过的 message.done 消息ID集合
  private processedMessageDones = new Set<string>()

  /**
   * 处理 message.done 事件
   * 完成消息流式输出
   */
  private handleMessageDone(event: MessageDoneEvent): void {
    const { updateMessage, updateMessageMetadata, messages } = useChatStore.getState()

    // 🔥🔥🔥 防重保护：如果已处理过，直接忽略
    if (this.processedMessageDones.has(event.data.message_id)) {
      logger.debug('[EventHandler] message.done: 已处理过，忽略重复事件:', event.data.message_id)
      return
    }
    this.processedMessageDones.add(event.data.message_id)

    // 查找消息
    const message = messages.find(m => m.id === event.data.message_id)

    if (DEBUG) {
      logger.debug('[EventHandler] message.done: 消息ID', event.data.message_id, '找到消息:', !!message, '内容长度:', event.data.full_content?.length)
    }

    if (!message) {
      logger.warn('[EventHandler] message.done: 找不到消息:', event.data.message_id)
      return
    }

    // 🔥 最终校准：用后端返回的完整内容覆盖前端累积内容
    // 这可以纠正流式传输中可能的数据丢失或乱序问题
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
   * 处理 router.start 事件
   * Phase 3: 路由开始，更新 thinking 状态
   */
  private handleRouterStart(event: RouterStartEvent): void {
    // 更新最后一条 AI 消息的 thinking 状态
    const { messages, updateMessageMetadata } = useChatStore.getState()
    const lastAiMessage = [...messages].reverse().find(m => m.role === 'assistant')

    if (lastAiMessage) {
      const existingThinking = lastAiMessage.metadata?.thinking || []

      // 查找或创建 router 的 thinking 步骤
      const routerStepIndex = existingThinking.findIndex((s: any) => s.expertType === 'router')
      const routerStep = {
        id: `router-${event.id}`,
        expertType: 'router',
        expertName: '智能路由',
        content: '正在分析意图，选择执行模式...',
        timestamp: event.data.timestamp,
        status: 'running' as const,
        type: 'analysis' as const
      }

      let newThinking
      if (routerStepIndex >= 0) {
        // 更新现有的 router 步骤
        newThinking = [...existingThinking]
        newThinking[routerStepIndex] = routerStep
      } else {
        // 添加新的 router 步骤
        newThinking = [...existingThinking, routerStep]
      }

      updateMessageMetadata(lastAiMessage.id!, { thinking: newThinking })
    }

    if (DEBUG) {
      logger.debug('[EventHandler] 路由开始:', event.data.query.substring(0, 50))
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

      // 🔥 Phase 3: 更新 router thinking 步骤为完成状态
    const { messages, updateMessageMetadata } = useChatStore.getState()
    const lastAiMessage = [...messages].reverse().find(m => m.role === 'assistant')

    if (lastAiMessage?.metadata?.thinking) {
      const thinking = [...lastAiMessage.metadata.thinking]
      const routerStepIndex = thinking.findIndex((s: any) => s.expertType === 'router')

      if (routerStepIndex >= 0) {
        const modeText = event.data.decision === 'simple' ? '简单模式' : '复杂模式（多专家协作）'
        thinking[routerStepIndex] = {
          ...thinking[routerStepIndex],
          status: 'completed',
          content: `意图分析完成：已选择${modeText}`
        }
        updateMessageMetadata(lastAiMessage.id!, { thinking })
      }
    }

    if (DEBUG) {
      logger.debug('[EventHandler] 路由决策，设置模式:', event.data.decision)
    }
  }

  /**
   * 🔥🔥🔥 v3.1.0 HITL: 处理 human.interrupt 事件
   * Commander 规划完成，等待人类审核
   */
  private handleHumanInterrupt(event: HumanInterruptEvent): void {
    const { setPendingPlan } = useTaskStore.getState()
    
    // 直接获取 current_plan
    const currentPlan = event.data?.current_plan
    
    // 将待审核计划存入 Store，触发 UI 显示
    if (currentPlan && currentPlan.length > 0) {
      setPendingPlan(currentPlan)
      logger.info('[EventHandler] 🔴 HITL 中断: 计划等待审核', {
        taskCount: currentPlan.length
      })
    } else {
      logger.warn('[EventHandler] ⚠️ HITL 事件数据不完整:', event)
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
