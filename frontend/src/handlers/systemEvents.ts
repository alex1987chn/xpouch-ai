/**
 * System/Error/Router 相关事件处理器
 * 
 * 处理的事件类型：
 * - router.start: 路由开始
 * - router.decision: 路由决策
 * - human.interrupt: HITL 中断
 * - error: 错误事件
 */

import type {
  RouterStartEvent,
  RouterDecisionEvent,
  HumanInterruptEvent,
  ErrorEvent
} from './types'
import type { HandlerContext } from './types'
import { getLastAssistantMessage } from './utils'
import { logger } from '@/utils/logger'
import type { ThinkingStep } from '@/types'

/**
 * 处理 router.start 事件
 * Phase 3: 路由开始，更新 thinking 状态
 */
export function handleRouterStart(
  event: RouterStartEvent,
  context: HandlerContext
): void {
  const { chatStore, debug } = context
  const { updateMessageMetadata } = chatStore

  // 🔥 性能优化：使用缓存 ID 查找最后一条助手消息
  const lastAi = getLastAssistantMessage(chatStore)

  if (lastAi) {
    const existingThinking = lastAi.message.metadata?.thinking || []

    // 查找或创建 router 的 thinking 步骤
    const routerStepIndex = existingThinking.findIndex(
      (s: ThinkingStep) => s.expertType === 'router'
    )
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

  if (debug) {
    logger.debug('[SystemEvents] 路由开始:', event.data.query.substring(0, 50))
  }
}

/**
 * 处理 router.decision 事件
 * v3.0: 设置模式，触发 UI 切换
 */
export function handleRouterDecision(
  event: RouterDecisionEvent,
  context: HandlerContext
): void {
  const { taskStore, chatStore, debug } = context
  const { setMode, resetUI, mode } = taskStore
  const { updateMessageMetadata } = chatStore

  // 如果模式切换，重置 UI 状态
  if (mode !== event.data.decision) {
    resetUI()
  }

  // 设置模式（simple 或 complex）
  setMode(event.data.decision)

  // 🔥 性能优化：使用缓存 ID 查找最后一条助手消息
  const lastAi = getLastAssistantMessage(chatStore)

  if (debug) {
    logger.debug(
      '[SystemEvents] router.decision: lastAi=',
      !!lastAi,
      'thinking=',
      lastAi?.message.metadata?.thinking?.length
    )
  }

  if (lastAi?.message.metadata?.thinking) {
    const thinking = [...lastAi.message.metadata.thinking]
    const routerStepIndex = thinking.findIndex((s: ThinkingStep) => s.expertType === 'router')

    if (debug) {
      logger.debug('[SystemEvents] router.decision: routerStepIndex=', routerStepIndex)
    }

    if (routerStepIndex >= 0) {
      const modeText =
        event.data.decision === 'simple' ? '简单模式' : '复杂模式（多专家协作）'
      thinking[routerStepIndex] = {
        ...thinking[routerStepIndex],
        status: 'completed',
        content: `意图分析完成：已选择${modeText}`
      }
      updateMessageMetadata(lastAi.id, { thinking })
      if (debug) {
        logger.debug('[SystemEvents] router.decision: router step 已标记为 completed')
      }
    }
  }

  if (debug) {
    logger.debug('[SystemEvents] 路由决策，设置模式:', event.data.decision)
  }
}

/**
 * 🔥🔥🔥 v3.1.0 HITL: 处理 human.interrupt 事件
 * Commander 规划完成，等待人类审核
 */
export function handleHumanInterrupt(
  event: HumanInterruptEvent,
  context: HandlerContext
): void {
  const { taskStore } = context
  const { setPendingPlan } = taskStore

  // 直接获取 current_plan
  const currentPlan = event.data?.current_plan
  const planVersion = event.data?.plan_version

  // 将待审核计划存入 Store，触发 UI 显示
  if (currentPlan?.length > 0) {
    setPendingPlan(currentPlan, planVersion ?? 1)
    logger.info('[SystemEvents] 🔴 HITL 中断: 计划等待审核', {
      taskCount: currentPlan.length,
      planVersion: planVersion ?? 1
    })
  } else {
    logger.warn('[SystemEvents] ⚠️ HITL 事件数据不完整:', event)
  }
}

/**
 * 处理 error 事件
 * 记录错误
 */
export function handleError(event: ErrorEvent, _context: HandlerContext): void {
  logger.error('[SystemEvents] 服务器错误:', event.data.code, event.data.message)

  // 可以在这里显示错误提示
  // toast.error(`错误: ${event.data.message}`)
}
