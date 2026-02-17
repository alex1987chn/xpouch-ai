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
 * [架构 v3.2.0]
 * chat.ts (SSE 连接) -> EventHandler -> Stores -> React Components
 * 
 * [事件分发]
 * - message.* 事件 -> chat.ts onChunk -> ChatStore (流式对话)
 * - plan/task/artifact 事件 -> EventHandler -> TaskStore (批处理)
 * 
 * [批处理模式]
 * - artifact.generated 包含完整内容，直接存入 task.artifacts
 * - 废弃流式：artifact.start/chunk/completed 不再使用
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
// 辅助函数
// ============================================================================

/**
 * 🔥 性能优化：获取最后一条助手消息
 * 优先使用缓存的 lastAssistantMessageId，避免遍历整个消息数组
 */
function getLastAssistantMessage(): { message: any; id: string } | null {
  const { lastAssistantMessageId, messages, updateMessageMetadata } = useChatStore.getState()
  
  // 优先使用缓存 ID
  if (lastAssistantMessageId) {
    const msg = messages.find(m => m.id === lastAssistantMessageId)
    if (msg) {
      return { message: msg, id: lastAssistantMessageId }
    }
  }
  
  // 降级：遍历查找（兼容旧数据）
  const lastAiMessage = [...messages].reverse().find(m => m.role === 'assistant')
  if (lastAiMessage?.id) {
    return { message: lastAiMessage, id: lastAiMessage.id }
  }
  
  return null
}

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
      // 🔥 plan.created 用于初始化任务数据结构（必须调用 initializePlan 创建 tasks）
      case 'plan.created':
        this.handlePlanCreated(event as PlanCreatedEvent)
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
      // 🔥 v3.2.0 批处理模式：artifact.generated 包含完整内容
      // 注意：task.completed 只带500字节摘要，完整内容由本事件提供
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
   * 
   * 🔥 跨 Slice 协作：
   * - TaskSlice: 初始化任务数据结构
   * - UISlice: 标记初始化完成、设置模式为 complex
   * - ChatStore: 更新消息 thinking 状态
   */
  private handlePlanCreated(event: PlanCreatedEvent): void {
    const { initializePlan, setIsInitialized, setMode } = useTaskStore.getState()
    const { updateMessageMetadata } = useChatStore.getState()

    // TaskSlice: 初始化任务数据
    initializePlan(event.data)

    // UISlice: 标记初始化完成并设置模式
    setIsInitialized(true)
    setMode('complex')

    // 🔥 性能优化：使用缓存 ID 查找最后一条助手消息
    const lastAi = getLastAssistantMessage()
    
    if (lastAi?.message.metadata?.thinking) {
      const thinking = [...lastAi.message.metadata.thinking]
      const planStepIndex = thinking.findIndex(s => s.type === 'planning')
      
      if (planStepIndex >= 0) {
        thinking[planStepIndex] = {
          ...thinking[planStepIndex],
          status: 'completed',
          content: '任务规划完成'
        }
        updateMessageMetadata(lastAi.id, { thinking })
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
    // v3.2.0: 新规划开始
    const { startPlan } = useTaskStore.getState()
    const { updateMessageMetadata } = useChatStore.getState()
    
    // 🔥 注意：不要调用 resetAll()，否则会清空 plan.created 创建的任务
    startPlan(event.data)

    // 🔥 性能优化：使用缓存 ID 查找最后一条助手消息
    const lastAi = getLastAssistantMessage()
    
    if (lastAi) {
      const thinking = [...(lastAi.message.metadata?.thinking || [])]
      
      // 创建新的 planning step
      const planStep = {
        id: `plan-${event.data.session_id}`,
        expertType: 'planner',
        expertName: '任务规划',
        content: '',
        timestamp: new Date().toISOString(),
        status: 'running' as const,
        type: 'planning' as const
      }
      
      // 查找是否已存在规划步骤，避免重复
      const existingIndex = thinking.findIndex(s => s.type === 'planning')
      if (existingIndex >= 0) {
        thinking[existingIndex] = { ...thinking[existingIndex], ...planStep }
      } else {
        thinking.push(planStep)
      }
      
      updateMessageMetadata(lastAi.id, { thinking })
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
    const { appendPlanThinking } = useTaskStore.getState()
    const { updateMessageMetadata } = useChatStore.getState()
    
    appendPlanThinking(event.data)

    if (DEBUG) {
      logger.debug('[EventHandler] 🧠 plan.thinking:', event.data.delta.substring(0, 30) + '...')
    }

    // 🔥 性能优化：使用缓存 ID 查找最后一条助手消息
    const lastAi = getLastAssistantMessage()
    
    if (lastAi?.message.metadata?.thinking) {
      const thinking = [...lastAi.message.metadata.thinking]
      const planStepIndex = thinking.findIndex(s => s.type === 'planning')
      
      if (planStepIndex >= 0) {
        // 🔥 只更新 content，不覆盖 title (expertName)
        thinking[planStepIndex] = {
          ...thinking[planStepIndex],
          content: thinking[planStepIndex].content + event.data.delta
        }
        updateMessageMetadata(lastAi.id, { thinking })
        if (DEBUG) {
          logger.debug('[EventHandler] thinking content 已更新')
        }
      } else if (DEBUG) {
        logger.warn('[EventHandler] 未找到 planning step')
      }
    } else if (DEBUG) {
      logger.warn('[EventHandler] 最后一条消息没有 thinking 元数据')
    }
  }

  /**
   * 处理 task.started 事件
   * 更新任务状态为 running
   */
  private handleTaskStarted(event: TaskStartedEvent): void {
    const { startTask, addRunningTaskId } = useTaskStore.getState()
    const { updateMessageMetadata } = useChatStore.getState()
    
    startTask(event.data)
    addRunningTaskId(event.data.task_id)

    // 🔥 性能优化：使用缓存 ID 查找最后一条助手消息
    const lastAi = getLastAssistantMessage()
    
    if (lastAi) {
      const existingThinking = lastAi.message.metadata?.thinking || []
      // 检查是否已存在该 task 的 step
      const existingIndex = existingThinking.findIndex((s: any) => s.id === event.data.task_id)
      
      if (existingIndex < 0) {
        const newStep = {
          id: event.data.task_id,
          expertType: event.data.expert_type,
          expertName: event.data.expert_type,
          content: event.data.description,
          timestamp: event.data.started_at,
          status: 'running' as const,
          type: 'execution' as const
        }
        updateMessageMetadata(lastAi.id, {
          thinking: [...existingThinking, newStep]
        })
        if (DEBUG) {
          logger.debug('[EventHandler] task.started: 添加 task step 到 thinking:', event.data.task_id)
        }
      }
    }

    if (DEBUG) {
      logger.debug('[EventHandler] 任务开始:', event.data.task_id)
    }
  }

  /**
   * 处理 task.completed 事件
   * 更新任务状态为 completed，并更新进度
   * 
   * 🔥 注意：event.data.output 只有500字节摘要
   * 完整内容通过 artifact.generated 事件单独发送
   * 
   * 🔥 选中策略：task.completed 不负责选中，由 artifact.generated 统一处理
   * 避免多个任务完成时的频繁切换问题
   */
  private handleTaskCompleted(event: TaskCompletedEvent): void {
    const { completeTask, setProgress, tasksCache, removeRunningTaskId } = useTaskStore.getState()
    const { updateMessageMetadata } = useChatStore.getState()
    
    completeTask(event.data)
    removeRunningTaskId(event.data.task_id)

    // 🔥 更新进度
    const completedCount = tasksCache.filter(t => t.status === 'completed').length
    const totalCount = tasksCache.length
    if (totalCount > 0) {
      setProgress({ current: completedCount, total: totalCount })
    }

    // 🔥 性能优化：使用缓存 ID 查找最后一条助手消息
    const lastAi = getLastAssistantMessage()
    
    if (lastAi?.message.metadata?.thinking) {
      const thinking = [...lastAi.message.metadata.thinking]
      const taskStepIndex = thinking.findIndex((s: any) => s.id === event.data.task_id)
      
      if (taskStepIndex >= 0) {
        thinking[taskStepIndex] = {
          ...thinking[taskStepIndex],
          status: 'completed',
          content: event.data.output || '任务执行完成'
        }
        updateMessageMetadata(lastAi.id, { thinking })
        if (DEBUG) {
          logger.debug('[EventHandler] task.completed: task step 已标记为 completed:', event.data.task_id)
        }
      }
    }

    if (DEBUG) {
      logger.debug('[EventHandler] 任务完成:', event.data.task_id, '进度:', completedCount, '/', totalCount)
    }
  }

  /**
   * 处理 task.failed 事件
   * 更新任务状态为 failed
   */
  private handleTaskFailed(event: TaskFailedEvent): void {
    const { failTask, removeRunningTaskId } = useTaskStore.getState()
    failTask(event.data)
    removeRunningTaskId(event.data.task_id)  // 🔥 新增：更新 UI 状态

    logger.error('[EventHandler] 任务失败:', event.data.task_id, event.data.error)
  }

  /**
   * 处理 artifact.generated 事件
   * 批处理模式 - 直接添加完整的 artifact
   * 添加产物到对应任务
   * 
   * 🔥 智能选中策略：
   * - 如果用户没有选中任何任务，自动选中新完成的有产物任务
   * - 如果用户已手动选中某个任务，保持不变（避免打断用户查看）
   */
  private handleArtifactGenerated(event: ArtifactGeneratedEvent): void {
    const { addArtifact, selectTask, selectedTaskId, tasks } = useTaskStore.getState()
    
    // 🔥 调试日志：记录当前状态
    if (DEBUG) {
      const task = tasks.get(event.data.task_id)
      logger.debug('[EventHandler] artifact.generated: 收到事件', {
        taskId: event.data.task_id,
        artifactId: event.data.artifact.id,
        artifactType: event.data.artifact.type,
        taskExists: !!task,
        currentArtifactsCount: task?.artifacts?.length || 0
      })
    }
    
    addArtifact(event.data)
    
    // 🔥 智能选中：只有当用户未选中任务，或选中的任务无产物时，才自动切换
    const currentSelectedTask = selectedTaskId ? tasks.get(selectedTaskId) : null
    const shouldAutoSelect = !selectedTaskId || 
      (currentSelectedTask && currentSelectedTask.artifacts.length === 0)
    
    if (shouldAutoSelect) {
      selectTask(event.data.task_id)
    }

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
    // 统一获取 Store 状态（避免多次 getState 调用）
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
      logger.debug('[EventHandler] message.done: 消息ID=', event.data.message_id, '找到消息=', !!message, '内容长度=', event.data.full_content?.length)
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
    
    // 🔥🔥🔥 关键修复：message.done 时将所有 thinking steps 标记为 completed
    // 防止流结束后仍有 running 状态的步骤导致 UI 一直转圈
    // 复用已获取的 messages，避免再次 getState()
    const finalMessage = messages.find(m => m.id === event.data.message_id)
    if (DEBUG) {
      logger.debug('[EventHandler] message.done: finalMessage=', !!finalMessage, 'thinking=', finalMessage?.metadata?.thinking?.length)
    }
    if (finalMessage?.metadata?.thinking && finalMessage.metadata.thinking.length > 0) {
      const hasRunningSteps = finalMessage.metadata.thinking.some((s: any) => s.status === 'running')
      if (DEBUG) {
        logger.debug('[EventHandler] message.done: hasRunningSteps=', hasRunningSteps)
      }
      if (hasRunningSteps) {
        const completedThinking = finalMessage.metadata.thinking.map((s: any) => ({
          ...s,
          status: 'completed' as const
        }))
        updateMessageMetadata(event.data.message_id, { thinking: completedThinking })
        if (DEBUG) {
          logger.debug('[EventHandler] message.done: 已将所有 thinking steps 标记为 completed')
        }
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
    const { updateMessageMetadata } = useChatStore.getState()
    
    // 🔥 性能优化：使用缓存 ID 查找最后一条助手消息
    const lastAi = getLastAssistantMessage()

    if (lastAi) {
      const existingThinking = lastAi.message.metadata?.thinking || []

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
        newThinking = [...existingThinking]
        newThinking[routerStepIndex] = routerStep
      } else {
        newThinking = [...existingThinking, routerStep]
      }

      updateMessageMetadata(lastAi.id, { thinking: newThinking })
    }

    if (DEBUG) {
      logger.debug('[EventHandler] 路由开始:', event.data.query.substring(0, 50))
    }
  }

  /**
   * 处理 router.decision 事件
   * v3.0: 设置模式，触发 UI 切换
   * 🔥 注意：不再在这里移除空消息，交给 ChatStreamPanel 的过滤逻辑处理
   */
  private handleRouterDecision(event: RouterDecisionEvent): void {
    const { setMode, resetUI, mode } = useTaskStore.getState()
    const { updateMessageMetadata } = useChatStore.getState()

    // 如果模式切换，重置 UI 状态
    if (mode !== event.data.decision) {
      resetUI()
    }

    // 设置模式（simple 或 complex）
    setMode(event.data.decision)

    // 🔥 性能优化：使用缓存 ID 查找最后一条助手消息
    const lastAi = getLastAssistantMessage()

    if (DEBUG) {
      logger.debug('[EventHandler] router.decision: lastAi=', !!lastAi, 'thinking=', lastAi?.message.metadata?.thinking?.length)
    }

    if (lastAi?.message.metadata?.thinking) {
      const thinking = [...lastAi.message.metadata.thinking]
      const routerStepIndex = thinking.findIndex((s: any) => s.expertType === 'router')

      if (DEBUG) {
        logger.debug('[EventHandler] router.decision: routerStepIndex=', routerStepIndex)
      }

      if (routerStepIndex >= 0) {
        const modeText = event.data.decision === 'simple' ? '简单模式' : '复杂模式（多专家协作）'
        thinking[routerStepIndex] = {
          ...thinking[routerStepIndex],
          status: 'completed',
          content: `意图分析完成：已选择${modeText}`
        }
        updateMessageMetadata(lastAi.id, { thinking })
        if (DEBUG) {
          console.log('[EventHandler] router.decision: router step 已标记为 completed')
        }
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
