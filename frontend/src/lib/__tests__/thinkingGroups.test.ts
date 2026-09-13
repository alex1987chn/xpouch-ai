import { describe, it, expect } from 'vitest'
import { groupThinkingSteps, expertGroupStatus } from '../thinkingGroups'
import type { ThinkingStep } from '@/types'

const step = (over: Partial<ThinkingStep> & { id: string }): ThinkingStep => ({
  expertType: 'search',
  expertName: 'search',
  content: '',
  timestamp: '2026-09-13T00:00:00Z',
  status: 'completed',
  type: 'execution',
  ...over,
})

describe('groupThinkingSteps', () => {
  it('相邻的同专家任务合并为一组', () => {
    const rows = groupThinkingSteps([
      step({ id: 't1', expertType: 'search' }),
      step({ id: 't2', expertType: 'search' }),
    ])

    expect(rows).toEqual([
      { kind: 'expert', expertType: 'search', steps: [expect.objectContaining({ id: 't1' }), expect.objectContaining({ id: 't2' })] },
    ])
  })

  it('不同专家各自成组，保持出现顺序', () => {
    const rows = groupThinkingSteps([
      step({ id: 't1', expertType: 'search' }),
      step({ id: 't2', expertType: 'analyzer' }),
      step({ id: 't3', expertType: 'search' }),
    ])

    expect(rows.map(r => (r.kind === 'expert' ? r.expertType : 'step'))).toEqual([
      'search',
      'analyzer',
      'search',
    ])
  })

  it('编排类步骤（路由/规划）内联在原位置，不并入分组', () => {
    const rows = groupThinkingSteps([
      step({ id: 'router', expertType: 'router', type: 'analysis' }),
      step({ id: 'plan', expertType: 'planner', type: 'planning' }),
      step({ id: 't1', expertType: 'search' }),
    ])

    expect(rows.map(r => (r.kind === 'expert' ? r.expertType : 'step'))).toEqual([
      'step',
      'step',
      'search',
    ])
  })

  it('编排步骤夹在中间时会把同专家的两组切开（时间顺序不重排）', () => {
    const rows = groupThinkingSteps([
      step({ id: 't1', expertType: 'search' }),
      step({ id: 'meta', expertType: 'router', type: 'analysis' }),
      step({ id: 't2', expertType: 'search' }),
    ])

    expect(rows).toEqual([
      { kind: 'expert', expertType: 'search', steps: [expect.objectContaining({ id: 't1' })] },
      { kind: 'step', step: expect.objectContaining({ id: 'meta' }) },
      { kind: 'expert', expertType: 'search', steps: [expect.objectContaining({ id: 't2' })] },
    ])
  })

  it('expertType 为空的任务不分组（不造空名组）', () => {
    const rows = groupThinkingSteps([step({ id: 't1', expertType: '' })])

    expect(rows[0].kind).toBe('step')
  })

  it('空列表返回空', () => {
    expect(groupThinkingSteps([])).toEqual([])
  })
})

describe('expertGroupStatus', () => {
  it('任一行在执行 → running（并行时组头要亮着）', () => {
    expect(
      expertGroupStatus([
        step({ id: 'a', status: 'completed' }),
        step({ id: 'b', status: 'running' }),
      ])
    ).toBe('running')
  })

  it('无执行中但有失败 → failed', () => {
    expect(
      expertGroupStatus([step({ id: 'a', status: 'completed' }), step({ id: 'b', status: 'failed' })])
    ).toBe('failed')
  })

  it('全部完成 → completed', () => {
    expect(expertGroupStatus([step({ id: 'a' }), step({ id: 'b' })])).toBe('completed')
  })
})
