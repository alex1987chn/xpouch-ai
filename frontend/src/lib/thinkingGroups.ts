/**
 * 思考面板的**按专家分组**（纯函数，便于单测）。
 *
 * [为什么分组]
 * 一次运行里专家是并行的——C2 之后同一波次可以同时跑多位专家。平铺的一串
 * 「任务执行」既看不出**谁**在干活，也看不出哪几行是同一个人的活；而蓝图要传达的
 * 恰恰是这两件事（专家署名 + 当前谁在执行）。分组后：组头 = 专家（识别色 + 名字 +
 * 任务数 + 进行中），组内 = 该专家负责的任务行。串行执行时它自然退化成"一位接一位
 * 出现"，与蓝本观感一致；并行时多个组同时亮，用户看到的是真实情况，
 * 而不是被前端拉直的假串行。
 *
 * [分组规则]
 * - 只有**任务步骤**（type='execution'）参与分组；
 * - 只与**相邻**的同专家任务合并：路由决策、任务规划这类编排步骤仍按原位置内联，
 *   时间顺序不被重排（账本/实时都按到达顺序入列）；
 * - expertType 为空的任务不分组（宁可不漂亮，也不要把无名任务归进一个空名组）。
 */

import type { ThinkingStep } from '@/types'

/** 面板的一行：单步（编排类）或一个专家分组 */
export type ThinkingRow =
  | { kind: 'step'; step: ThinkingStep }
  | { kind: 'expert'; expertType: string; steps: ThinkingStep[] }

export function groupThinkingSteps(steps: ThinkingStep[]): ThinkingRow[] {
  const rows: ThinkingRow[] = []

  for (const step of steps) {
    const expertType = step.type === 'execution' ? (step.expertType || '').trim() : ''

    if (!expertType) {
      rows.push({ kind: 'step', step })
      continue
    }

    const open = rows[rows.length - 1]
    if (open?.kind === 'expert' && open.expertType === expertType) {
      open.steps.push(step)
      continue
    }
    rows.push({ kind: 'expert', expertType, steps: [step] })
  }

  return rows
}

/** 分组聚合状态：进行中优先，其次有失败，否则视为完成（与行内状态圆标同口径） */
export function expertGroupStatus(steps: ThinkingStep[]): ThinkingStep['status'] {
  if (steps.some(s => s.status === 'running')) return 'running'
  if (steps.some(s => s.status === 'failed')) return 'failed'
  if (steps.some(s => s.status === 'pending')) return 'pending'
  return 'completed'
}
