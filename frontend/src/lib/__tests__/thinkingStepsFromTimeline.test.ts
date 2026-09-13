/**
 * 「思考过程」面板从运行事件账本重建（方案 b）的映射测试。
 *
 * 要钉死的性质：
 * 1. 只把里程碑事件变成步骤，其余（生命周期 / HITL / 产物）一律不产生步骤
 * 2. 步骤的 type / expertName / status 与**实时面板**一致（否则同一件事两处长得不一样）
 * 3. 任务步骤带耗时；失败任务落 failed
 * 4. 顺序按时间升序（面板从上到下就是执行顺序）
 */

import { describe, it, expect } from 'vitest'
import { buildThinkingStepsFromTimeline } from '../thinkingStepsFromTimeline'
import type { RunEvent } from '@/types/run'

const LABELS = {
  planDone: '任务规划完成',
  taskDone: '任务执行完成',
  taskFailed: '任务执行失败',
  routerDone: (mode: unknown) =>
    `意图分析完成：已选择${mode === 'simple' ? '简单模式' : '复杂模式'}`,
}

function ev(partial: Partial<RunEvent> & { id: number; event_type: RunEvent['event_type'] }): RunEvent {
  return {
    run_id: 'r1',
    timestamp: '2026-09-13T09:00:00',
    ...partial,
  } as RunEvent
}

describe('buildThinkingStepsFromTimeline', () => {
  it('把路由决策映射成与实时一致的分析步骤', () => {
    const steps = buildThinkingStepsFromTimeline(
      [ev({ id: 1, event_type: 'router_decided', event_data: { mode: 'simple', reason: 'x' } })],
      LABELS,
    )

    expect(steps).toHaveLength(1)
    expect(steps[0]).toMatchObject({
      expertType: 'router',
      expertName: '智能路由',
      content: '意图分析完成：已选择简单模式',
      status: 'completed',
      type: 'analysis',
    })
  })

  it('复杂模式的路由结论用与实时相同的措辞', () => {
    const steps = buildThinkingStepsFromTimeline(
      [ev({ id: 1, event_type: 'router_decided', event_data: { mode: 'complex' } })],
      LABELS,
    )
    // 措辞由调用方注入（实际是 i18n 的 thinkingRouterDone + modeComplex），
    // 实时面板与账本重建共用同一词条 → 两处必然一致
    expect(steps[0].content).toBe('意图分析完成：已选择复杂模式')
  })

  it('计划与任务步骤带上专家名 / 耗时 / 状态', () => {
    const steps = buildThinkingStepsFromTimeline(
      [
        ev({ id: 1, event_type: 'plan_created', execution_plan_id: 'p1', timestamp: '2026-09-13T09:00:01' }),
        ev({
          id: 2,
          event_type: 'task_started',
          task_id: 'task_1',
          timestamp: '2026-09-13T09:00:10',
          event_data: { expert_type: 'writer', description: '写一份对比报告' },
        }),
        ev({
          id: 3,
          event_type: 'task_completed',
          task_id: 'task_1',
          timestamp: '2026-09-13T09:00:30',
          event_data: { expert_type: 'writer', has_artifact: true, duration_ms: 29300 },
        }),
      ],
      LABELS,
    )

    expect(steps.map(s => s.type)).toEqual(['planning', 'execution'])
    expect(steps[0]).toMatchObject({ id: 'plan-p1', content: '任务规划完成' })
    expect(steps[1]).toMatchObject({
      id: 'task_1',
      expertName: 'writer',
      expertType: 'writer',
      // 任务描述来自 task_started，与实时面板进行中显示的一致
      content: '写一份对比报告',
      status: 'completed',
      duration: 29300,
    })
  })

  it('同一任务的 started 重复出现时只保留一步（账本曾重复写 task_started）', () => {
    const steps = buildThinkingStepsFromTimeline(
      [
        ev({ id: 1, event_type: 'task_started', task_id: 't1', timestamp: '2026-09-13T09:00:00', event_data: { expert_type: 'search', description: '第一版描述' } }),
        ev({ id: 2, event_type: 'task_started', task_id: 't1', timestamp: '2026-09-13T09:00:05', event_data: { expert_type: 'search', description: '第一版描述' } }),
        ev({ id: 3, event_type: 'task_completed', task_id: 't1', timestamp: '2026-09-13T09:00:20', event_data: { expert_type: 'search', duration_ms: 20000 } }),
      ],
      LABELS,
    )

    expect(steps).toHaveLength(1)
    expect(steps[0]).toMatchObject({ id: 't1', content: '第一版描述', duration: 20000, status: 'completed' })
  })

  it('只有 task_completed（缺 started）时也能成步', () => {
    const steps = buildThinkingStepsFromTimeline(
      [ev({ id: 5, event_type: 'task_completed', task_id: 't5', event_data: { expert_type: 'coder', duration_ms: 1200 } })],
      LABELS,
    )
    expect(steps[0]).toMatchObject({ id: 't5', content: '任务执行完成', duration: 1200 })
  })

  it('失败任务落 failed 并用失败文案（账本今天不一定有，防御性覆盖）', () => {
    const steps = buildThinkingStepsFromTimeline(
      [ev({ id: 3, event_type: 'task_failed', task_id: 't9', event_data: { expert_type: 'coder' } })],
      LABELS,
    )
    expect(steps[0]).toMatchObject({ status: 'failed', content: '任务执行失败', expertName: 'coder' })
  })

  it('生命周期 / HITL / 产物事件不产生步骤', () => {
    const steps = buildThinkingStepsFromTimeline(
      [
        ev({ id: 1, event_type: 'run_created' }),
        ev({ id: 2, event_type: 'run_started' }),
        ev({ id: 3, event_type: 'hitl_interrupted' }),
        ev({ id: 4, event_type: 'hitl_resumed' }),
        ev({ id: 5, event_type: 'artifact_generated', task_id: 'task_1' }),
        ev({ id: 6, event_type: 'run_completed' }),
      ],
      LABELS,
    )
    expect(steps).toEqual([])
  })

  it('按时间升序排列（乱序输入也不乱）', () => {
    const steps = buildThinkingStepsFromTimeline(
      [
        ev({ id: 1, event_type: 'task_completed', task_id: 't2', timestamp: '2026-09-13T09:05:00', event_data: { expert_type: 'b' } }),
        ev({ id: 2, event_type: 'router_decided', timestamp: '2026-09-13T09:00:00', event_data: { mode: 'complex' } }),
        ev({ id: 3, event_type: 'plan_created', timestamp: '2026-09-13T09:01:00' }),
      ],
      LABELS,
    )
    expect(steps.map(s => s.id)).toEqual(['router-2', 'plan-3', 't2'])
  })

  it('缺字段的事件不炸：专家名兜底、耗时缺省、id 用事件 id', () => {
    const steps = buildThinkingStepsFromTimeline(
      [ev({ id: 7, event_type: 'task_completed', task_id: null as unknown as string })],
      LABELS,
    )
    expect(steps[0]).toMatchObject({ id: 'task-7', expertName: 'expert', status: 'completed' })
    expect(steps[0].duration).toBeUndefined()
  })
})
