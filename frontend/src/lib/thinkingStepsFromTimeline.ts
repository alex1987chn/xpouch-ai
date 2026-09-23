/**
 * 从运行事件账本（`runevent`）重建「思考过程」的步骤骨架。
 *
 * [为什么需要] 思考步骤此前**只活在前端内存**：流式期间由 SSE 事件在
 * `message.metadata.thinking` 上拼出来，服务端只持久化正文与附件。
 * 于是刷新页面（store 被服务端数据整体替换）后，思考面板就消失了。
 * 但这些步骤的骨架其实一直都在事件账本里（`router_decided` / `plan_created` /
 * `task_completed`），端点也现成（`GET /runs/{id}/timeline`，任务控制页在用）。
 * 所以恢复时按账本把骨架重建出来，挂回最后一条助手消息即可——不新增持久化、
 * 不改任何契约。
 *
 * [与实时面板的差异，有意接受]
 * - 任务步骤的正文是「任务执行完成」而不是各任务的产出预览：产出预览只走 SSE，
 *   从未落账本（账本只记里程碑）。步骤名 + 专家 + 耗时 + 成败仍完整。
 * - 没有「思考中」这类流式中间态：账本记的是已发生的事实。
 *
 * [文案口径] 与实时面板逐字对齐（含那句硬编码中文的意图分析结论）——
 * 两处显示同一件事却措辞不同，比不完美更糟。
 */

import type { RunEvent } from '@/types/run'
import type { ThinkingStep } from '@/types'

export interface ThinkingStepLabels {
  /** 步骤署名：路由（i18n: thinkingRouting）——与实时面板共用词条（评审 M8） */
  routerName: string
  /** 步骤署名：规划（i18n: thinkingPlanning） */
  planName: string
  /** 计划生成完成（i18n: thinkingPlanDone） */
  planDone: string
  /** 单个任务执行完成（i18n: thinkingTaskDone） */
  taskDone: string
  /** 单个任务执行失败（i18n: thinkingTaskFailed） */
  taskFailed: string
  /** 意图分析结论（i18n: thinkingRouterDone，需要 mode 文案）——由调用方给全句，
   *  保证与实时面板（handlers/systemEvents）逐字一致 */
  routerDone: (mode: unknown) => string
}

/** 账本里哪些事件算「思考过程的一步」——其余（生命周期/HITL/产物）不产生步骤 */
const STEP_EVENTS = new Set([
  'router_decided',
  'plan_created',
])

/** 与 systemEvents 的实时文案共用同一个 i18n 词条（由调用方注入，见 ThinkingStepLabels） */
/** 账本里的 mode → 结论句（走调用方注入的 i18n 文案，与实时面板同源） */
function routerConclusion(mode: unknown, labels: ThinkingStepLabels): string {
  return labels.routerDone(mode)
}

/**
 * 账本事件 → 思考步骤（按时间升序）。
 *
 * 纯函数、无 IO：便于单测，也让调用方（useSessionRestore）自己决定何时取数。
 */
export function buildThinkingStepsFromTimeline(
  events: RunEvent[],
  labels: ThinkingStepLabels,
): ThinkingStep[] {
  const steps: ThinkingStep[] = []
  // 任务步骤按 task_id 归并：账本里 task_started 可能重复（工具循环重入曾多写一行），
  // 归并后一个任务只出现一次，与前端实时面板的「按 task_id 复用同一步」一致

  for (const event of events) {
    if (!STEP_EVENTS.has(event.event_type)) continue
    const data = event.event_data ?? {}

    switch (event.event_type) {
      case 'router_decided':
        steps.push({
          id: `router-${event.id}`,
          expertType: 'router',
          expertName: labels.routerName,
          content: routerConclusion(data.mode, labels),
          timestamp: event.created_at,
          status: 'completed',
          type: 'analysis',
        })
        break

      case 'plan_created':
        steps.push({
          id: `plan-${event.execution_plan_id ?? event.id}`,
          expertType: 'planner',
          expertName: labels.planName,
          content: labels.planDone,
          timestamp: event.created_at,
          status: 'completed',
          type: 'planning',
        })
        break

      default:
        break
    }
  }

  // 账本本身按时间追加，这里仍显式排序：调用方可能自行拼接过事件列表
  return steps.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
}
