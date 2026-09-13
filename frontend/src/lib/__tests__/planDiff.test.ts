/**
 * 计划修订对照（lib/planDiff）的单测。
 *
 * 钉死的性质：
 * 1. **按位置对齐**而不是按 id——修订后行 id 全换新，按 id 比会得到「全删全增」
 * 2. 依赖变化算「改了」（依赖是计划语义的一部分，用户要能看见它变了）
 * 3. 增删在末尾时能被准确识别；只展示有改动的行
 */

import { describe, expect, it } from 'vitest'

import { changedRowsOnly, diffPlans, summarizePlanDiff } from '../planDiff'
import type { TaskInfo } from '@/types/events'

function task(id: string, description: string, expert = 'search', depends: string[] = []): TaskInfo {
  return {
    id,
    expert_type: expert,
    description,
    sort_order: 0,
    status: 'pending',
    depends_on: depends,
  }
}

describe('diffPlans', () => {
  it('内容一致 → same（即使 id 不同，也算同一条）', () => {
    const rows = diffPlans([task('v1-a', '检索资料')], [task('v2-x', '检索资料')])

    expect(rows).toHaveLength(1)
    expect(rows[0].kind).toBe('same')
    expect(rows[0].before?.id).toBe('v1-a')
    expect(rows[0].after?.id).toBe('v2-x')
  })

  it('描述变化 → changed，且两侧都带出来', () => {
    const rows = diffPlans([task('a', '检索资料')], [task('b', '检索资料并翻译')])

    expect(rows[0].kind).toBe('changed')
    expect(rows[0].before?.description).toBe('检索资料')
    expect(rows[0].after?.description).toBe('检索资料并翻译')
  })

  it('专家类型变化也算改动', () => {
    const rows = diffPlans([task('a', '写作', 'writer')], [task('b', '写作', 'coder')])
    expect(rows[0].kind).toBe('changed')
  })

  it('依赖变化算改动（顺序不同不算）', () => {
    const changed = diffPlans([task('a', '分析', 'analyzer', ['t1'])], [task('b', '分析', 'analyzer', ['t1', 't2'])])
    expect(changed[0].kind).toBe('changed')

    const reordered = diffPlans(
      [task('a', '分析', 'analyzer', ['t1', 't2'])],
      [task('b', '分析', 'analyzer', ['t2', 't1'])]
    )
    expect(reordered[0].kind).toBe('same')
  })

  it('修订后更短 → 末尾是 removed', () => {
    const rows = diffPlans(
      [task('a', '检索'), task('b', '分析'), task('c', '写作')],
      [task('x', '检索'), task('y', '分析')]
    )

    expect(rows.map((r) => r.kind)).toEqual(['same', 'same', 'removed'])
    expect(rows[2].before?.description).toBe('写作')
    expect(rows[2].after).toBeUndefined()
  })

  it('修订后更长 → 末尾是 added', () => {
    const rows = diffPlans([task('a', '检索')], [task('x', '检索'), task('y', '补充检索')])

    expect(rows.map((r) => r.kind)).toEqual(['same', 'added'])
    expect(rows[1].after?.description).toBe('补充检索')
  })

  it('空 → 有 视为全部新增（首次拿到计划也算一种「对照」）', () => {
    const rows = diffPlans([], [task('x', '检索'), task('y', '分析')])
    expect(rows.map((r) => r.kind)).toEqual(['added', 'added'])
  })
})

describe('summarizePlanDiff', () => {
  it('按类别计数，并给出 isEmpty（决定要不要展示改动区）', () => {
    const rows = diffPlans(
      [task('a', '检索'), task('b', '分析'), task('c', '写作')],
      [task('x', '检索'), task('y', '分析并翻译'), task('z', '补充')]
    )

    const summary = summarizePlanDiff(rows)
    expect(summary).toEqual({ added: 0, removed: 0, changed: 2, same: 1, isEmpty: false })
  })

  it('完全一致 → isEmpty 为真', () => {
    const rows = diffPlans([task('a', '检索')], [task('b', '检索')])
    expect(summarizePlanDiff(rows).isEmpty).toBe(true)
  })
})

describe('changedRowsOnly', () => {
  it('只留有改动的行（UI 默认只展示这些）', () => {
    const rows = diffPlans(
      [task('a', '检索'), task('b', '分析')],
      [task('x', '检索'), task('y', '分析并翻译'), task('z', '补充')]
    )

    expect(changedRowsOnly(rows).map((r) => r.kind)).toEqual(['changed', 'added'])
  })
})
