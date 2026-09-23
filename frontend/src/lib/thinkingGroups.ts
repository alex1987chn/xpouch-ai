import type { ThinkingStep } from '@/types'

/**
 * 思考步骤 → 渲染行。
 *
 * 2026-09-23 交互重构后 thinking 卡只剩编排步骤（路由/规划/模型思考）——
 * 专家执行改为独立消息（见 handlers/taskEvents），按专家分组的逻辑随之退役。
 */
export type ThinkingRow = { kind: 'step'; step: ThinkingStep }

export function groupThinkingSteps(steps: ThinkingStep[]): ThinkingRow[] {
  return steps.map(step => ({ kind: 'step', step }))
}
