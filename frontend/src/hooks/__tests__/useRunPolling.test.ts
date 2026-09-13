/**
 * 轮询状态机（useRunPolling 的 reducer）单测。
 *
 * 要钉死的不变量：
 * 1. 终态是「那个 run 的」结论，不是页面会话的结论——同一页面里来了新 run
 *    必须能重新起轮询（此前静态的 isTerminal 判断会把后续轮询永久锁死）。
 * 2. 同一个 run 已终态时不得重启（防止 restore→startPolling 把终态判定冲掉）。
 * 3. HITL 暂停/恢复只在 polling 态之间流转。
 */

import { describe, it, expect } from 'vitest'
import { isPollingOrphaned, pollingReducer, type PollingState } from '../useRunPolling'

const idle: PollingState = {
  status: 'idle',
  isPolling: false,
  isHITLPaused: false,
  isTerminal: false,
  hasError: false,
  runId: null,
}

const start = (runId: string) => pollingReducer(idle, { type: 'START', runId })
const hitlPaused = (runId: string) => pollingReducer(start(runId), { type: 'HITL_PAUSED' })
const terminalFor = (runId: string): PollingState =>
  pollingReducer(start(runId), { type: 'TERMINAL_REACHED' })

describe('pollingReducer', () => {
  it('START 进入轮询并记住 runId', () => {
    const state = start('run-1')
    expect(state.isPolling).toBe(true)
    expect(state.runId).toBe('run-1')
  })

  it('同一个 run 已终态时拒绝重启', () => {
    const state = terminalFor('run-1')
    const again = pollingReducer(state, { type: 'START', runId: 'run-1' })
    expect(again).toBe(state)
  })

  it('换了 run 允许重新起轮询（终态不再锁死后续任务）', () => {
    const state = terminalFor('run-1')
    const next = pollingReducer(state, { type: 'START', runId: 'run-2' })
    expect(next.isPolling).toBe(true)
    expect(next.isTerminal).toBe(false)
    expect(next.runId).toBe('run-2')
  })

  it('错误态同样按 runId 判定，且新 run 会清掉 hasError', () => {
    const errored = pollingReducer(start('run-1'), { type: 'ERROR_OCCURRED' })
    expect(errored.hasError).toBe(true)

    expect(pollingReducer(errored, { type: 'START', runId: 'run-1' })).toBe(errored)

    const next = pollingReducer(errored, { type: 'START', runId: 'run-2' })
    expect(next.hasError).toBe(false)
    expect(next.isPolling).toBe(true)
  })

  it('未跟踪任何 run 时终态/错误动作不改状态', () => {
    expect(pollingReducer(idle, { type: 'TERMINAL_REACHED' })).toBe(idle)
    expect(pollingReducer(idle, { type: 'ERROR_OCCURRED' })).toBe(idle)
  })

  it('HITL 暂停与恢复只在轮询态之间流转', () => {
    const paused = pollingReducer(start('run-1'), { type: 'HITL_PAUSED' })
    expect(paused.isHITLPaused).toBe(true)
    expect(paused.isPolling).toBe(true)
    expect(paused.runId).toBe('run-1')

    const resumed = pollingReducer(paused, { type: 'HITL_RESUMED' })
    expect(resumed.isHITLPaused).toBe(false)
    expect(resumed.isPolling).toBe(true)

    // 未在轮询时收到暂停/恢复：原样返回
    expect(pollingReducer(idle, { type: 'HITL_PAUSED' })).toBe(idle)
    expect(pollingReducer(idle, { type: 'HITL_RESUMED' })).toBe(idle)
  })

  it('STOP / RESET 回到初始态并释放 runId', () => {
    expect(pollingReducer(start('run-1'), { type: 'STOP' })).toEqual(idle)
    expect(pollingReducer(terminalFor('run-1'), { type: 'RESET' })).toEqual(idle)
    // 已 idle 时 STOP 不改状态（保持引用相等，避免无意义重渲染）
    expect(pollingReducer(idle, { type: 'STOP' })).toBe(idle)
  })

  it('终态重复上报不改状态', () => {
    const state = terminalFor('run-1')
    expect(pollingReducer(state, { type: 'TERMINAL_REACHED' })).toBe(state)
  })
})

describe('isPollingOrphaned：轮询失去输入就必须停', () => {
  it('有轮询状态但没有 run → 孤儿（新建会话/切线程会清掉 activeRunId）', () => {
    expect(isPollingOrphaned(start('run-1'), null)).toBe(true)
    expect(isPollingOrphaned(start('run-1'), undefined)).toBe(true)
    expect(isPollingOrphaned(hitlPaused('run-1'), null)).toBe(true)
  })

  it('有 run 时不受影响', () => {
    expect(isPollingOrphaned(start('run-1'), 'run-1')).toBe(false)
  })

  it('已经停下或已终态时不再触发（不与终态判定互相打扰）', () => {
    expect(isPollingOrphaned(idle, null)).toBe(false)
    expect(isPollingOrphaned(terminalFor('run-1'), null)).toBe(false)
    const errored = pollingReducer(start('run-1'), { type: 'ERROR_OCCURRED' })
    expect(isPollingOrphaned(errored, null)).toBe(false)
  })
})
