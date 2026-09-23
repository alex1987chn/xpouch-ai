import { describe, it, expect } from 'vitest'
import { groupThinkingSteps } from '../thinkingGroups'
import type { ThinkingStep } from '@/types'

function step(id: string, type: ThinkingStep['type'] = 'analysis'): ThinkingStep {
  return {
    id,
    expertType: type ?? 'default',
    expertName: id,
    content: '',
    timestamp: '2026-09-23T00:00:00Z',
    status: 'completed',
    type,
  }
}

describe('groupThinkingSteps（2026-09-23 交互重构：execution 步骤退役，平铺编排步骤）', () => {
  it('全部步骤平铺为 step 行，保持原顺序', () => {
    const rows = groupThinkingSteps([step('router'), step('plan'), step('reason', 'search')])
    expect(rows).toHaveLength(3)
    expect(rows.every(r => r.kind === 'step')).toBe(true)
    expect(rows.map(r => r.step.id)).toEqual(['router', 'plan', 'reason'])
  })
})
