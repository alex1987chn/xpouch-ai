/**
 * taskStore 持久化的往返契约（前端第二批：自研 persist → zustand 官方 persist）。
 *
 * 为什么值得测：持久化是「刷新后 UI 还记得什么」的唯一实现，而它跨了一个 JSON 边界
 * ——`Set` 过不去（官方 persist 用 JSON 存），必须靠 partialize/merge 两头配对转换。
 * 配错任何一头都是**静默**丢状态（刷新后模式回到 simple、运行中标记全没了），
 * 肉眼很难当场发现。
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { useTaskStore } from '../taskStore'

const STORAGE_KEY = 'xpouch-task-store'

function readPersisted(): { state: Record<string, unknown>; version: number } {
  const raw = localStorage.getItem(STORAGE_KEY)
  expect(raw, '持久化值必须存在').toBeTruthy()
  return JSON.parse(raw as string)
}

describe('taskStore 持久化', () => {
  beforeEach(() => {
    localStorage.clear()
    useTaskStore.setState({ mode: null })
  })

  it('只写 UI 偏好，且 Set 落成数组（JSON 可表达）', () => {
    useTaskStore.getState().setMode('complex')

    const persisted = readPersisted()
    expect(persisted.version).toBe(3)
    expect(persisted.state.mode).toBe('complex')
    expect(Array.isArray(persisted.state.runningTaskIds)).toBe(true)
    // 服务端数据的本地副本不得再进 localStorage（唯一真相在服务端）
    expect(persisted.state).not.toHaveProperty('tasks')
    expect(persisted.state).not.toHaveProperty('executionPlan')
    expect(persisted.state).not.toHaveProperty('artifacts')
    // PlanningSlice 的思考文本同理（评审 M5：只写不读的副本）
    expect(persisted.state).not.toHaveProperty('planThinkingContent')
  })

  it('读回时把数组还原成 Set（merge 的另一半）', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 3,
        state: {
          runningTaskIds: ['task-a', 'task-b'],
          mode: 'complex',
        },
      }),
    )

    await useTaskStore.persist.rehydrate()

    const state = useTaskStore.getState()
    expect(state.runningTaskIds).toBeInstanceOf(Set)
    expect([...state.runningTaskIds].sort()).toEqual(['task-a', 'task-b'])
    expect(state.mode).toBe('complex')
  })

  it('版本不匹配（旧的 @2 自研 persist 数据）不会污染状态', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 2, state: { mode: 'complex', runningTaskIds: ['x'] } }),
    )

    await useTaskStore.persist.rehydrate()

    expect(useTaskStore.getState().mode).toBeNull()
    expect(useTaskStore.getState().runningTaskIds.size).toBe(0)
  })
})
