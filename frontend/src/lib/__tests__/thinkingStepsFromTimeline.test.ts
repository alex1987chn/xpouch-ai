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
  routerName: '智能路由',
  planName: '任务规划',
  planDone: '任务规划完成',
  taskDone: '任务执行完成',
  taskFailed: '任务执行失败',
  routerDone: (mode: unknown) =>
    `意图分析完成：已选择${mode === 'simple' ? '简单模式' : '复杂模式'}`,
}

function ev(partial: Partial<RunEvent> & { id: number; event_type: RunEvent['event_type'] }): RunEvent {
  return {
    run_id: 'r1',
    created_at: '2026-09-13T09:00:00',
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

  it('孤儿 tool_result（任务步骤不存在）不产生步骤也不抛错', () => {
    const steps = buildThinkingStepsFromTimeline(
      [ev({ id: 1, event_type: 'tool_result', task_id: 'ghost', event_data: { tool: 'x', success: true, duration_ms: 1 } })],
      LABELS,
    )
    expect(steps).toHaveLength(0)
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
        ev({ id: 1, event_type: 'task_completed', task_id: 't2', created_at: '2026-09-13T09:05:00', event_data: { expert_type: 'b' } }),
        ev({ id: 2, event_type: 'router_decided', created_at: '2026-09-13T09:00:00', event_data: { mode: 'complex' } }),
        ev({ id: 3, event_type: 'plan_created', created_at: '2026-09-13T09:01:00' }),
      ],
      LABELS,
    )
    // 2026-09-23 交互重构：task 系事件不再重建为步骤（专家执行=独立消息）
    expect(steps.map(s => s.id)).toEqual(['router-2', 'plan-3'])
  })

  it('缺字段的事件不炸：路由缺 mode 也能成步、id 用事件 id 兜底', () => {
    const steps = buildThinkingStepsFromTimeline(
      [ev({ id: 9, event_type: 'router_decided', event_data: {} })],
      LABELS,
    )
    expect(steps).toHaveLength(1)
    expect(steps[0]).toMatchObject({
      expertType: 'router',
      status: 'completed',
      type: 'analysis',
    })
  })
})
