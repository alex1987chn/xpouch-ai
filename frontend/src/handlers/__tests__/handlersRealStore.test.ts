/**
 * 处理器 × **真实 store** 的契约测试。
 *
 * 为什么需要它：`2026-09-13` 把「本地任务副本」（tasks Map / tasksCache / artifact
 * slice / selectedTaskId / progress）整体删掉后，风险不在类型层（tsc 能查引用），
 * 而在**运行时的解构**——处理器里写 `const { completeTask } = taskStore`，若动作已
 * 不存在，类型若来自 `any`（测试桩）或旧签名，就会在真实事件到达时抛
 * `completeTask is not a function`，表现为流式过程中界面崩掉。
 *
 * 所以这个文件**不用桩 store**：直接拿真 store 喂真实事件。任何「处理器引用了不存在
 * 的动作」都会立刻抛出来——这就是那条「需实机验证」的自动化版本。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  handleTaskStarted,
  handleTaskCompleted,
  handleTaskFailed,
  handleTaskProgress,
  handlePlanCreated,
  handlePlanStarted,
  handlePlanThinking,
} from '../taskEvents'
import { handleArtifactGenerated } from '../artifactEvents'
import { handleRouterDecision } from '../systemEvents'
import { useTaskStore } from '@/store/taskStore'
import type { HandlerContext } from '../types'

vi.mock('@/utils/logger', () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

function realStoreContext(): HandlerContext {
  // chatStore 用最小桩：它不在本次清理范围内（消息与思考步骤仍由它承载）
  return {
    taskStore: useTaskStore.getState() as unknown as HandlerContext['taskStore'],
    chatStore: {
      messages: [
        {
          id: 'msg-1',
          role: 'assistant',
          timestamp: Date.now(),
          metadata: { thinking: [] },
        },
      ],
      lastAssistantMessageId: 'msg-1',
      updateMessageMetadata: vi.fn(),
    } as unknown as HandlerContext['chatStore'],
    debug: false,
  }
}

describe('事件处理器 × 真实 store：不得引用已删除的动作', () => {
  beforeEach(() => {
    // 每次从干净状态起步（resetAll 覆盖 UI + Planning 两个 slice）
    useTaskStore.getState().resetAll(true)
  })

  it('task.started / completed / failed：只维护 runningTaskIds 与思考步骤', () => {
    const context = realStoreContext()
    const startedAt = new Date().toISOString()

    handleTaskStarted(
      {
        id: 'e1',
        type: 'task.started',
        data: { task_id: 't1', expert_type: 'coder', description: '写代码', started_at: startedAt },
      } as never,
      context
    )
    expect(useTaskStore.getState().runningTaskIds.has('t1')).toBe(true)

    handleTaskCompleted(
      {
        id: 'e2',
        type: 'task.completed',
        data: { task_id: 't1', output: 'done', completed_at: startedAt, duration_ms: 12 },
      } as never,
      context
    )
    expect(useTaskStore.getState().runningTaskIds.has('t1')).toBe(false)

    handleTaskFailed(
      { id: 'e3', type: 'task.failed', data: { task_id: 't1', error: 'boom' } } as never,
      context
    )
    // 不抛异常本身就是要验的东西：处理器没有引用任何已删除的动作
  })

  it('task.progress：无 UI 消费者也不得写状态（保留处理器只为协议完整）', () => {
    const before = useTaskStore.getState()
    handleTaskProgress(
      { id: 'e4', type: 'task.progress', data: { task_id: 't1', progress: 50, message: '半程' } } as never,
      realStoreContext()
    )
    // store 的引用与内容都不该变（该事件当前只记日志）
    expect(useTaskStore.getState()).toBe(before)
  })

  it('plan.started / plan.thinking：PlanningSlice 已删，store 不得再有思考文本副本（评审 M5）', () => {
    const context = realStoreContext()

    handlePlanStarted(
      { id: 'e5', type: 'plan.started', data: { execution_plan_id: 'p1', content: '规划中' } } as never,
      context
    )
    handlePlanThinking(
      { id: 'e6', type: 'plan.thinking', data: { execution_plan_id: 'p1', delta: '…继续' } } as never,
      context
    )
    // 只写不读的本地副本已随 PlanningSlice 删除；思考流的真相在 message.metadata.thinking
    expect(
      (useTaskStore.getState() as Record<string, unknown>).planThinkingContent
    ).toBeUndefined()
  })

  it('plan.created / router.decision：只动 UI 标记（模式与初始化）', () => {
    const context = realStoreContext()

    handlePlanCreated(
      {
        id: 'e7',
        type: 'plan.created',
        data: {
          execution_plan_id: 'p1',
          summary: 's',
          estimated_steps: 2,
          execution_mode: 'sequential',
          tasks: [],
        },
      } as never,
      context
    )
    expect(useTaskStore.getState().isInitialized).toBe(true)
    expect(useTaskStore.getState().mode).toBe('complex')

    handleRouterDecision(
      { id: 'e8', type: 'router.decision', data: { decision: 'simple' } } as never,
      context
    )
    expect(useTaskStore.getState().mode).toBe('simple')
  })

  it('artifact.generated：产物只挂思考步骤，不落本地副本', () => {
    const context = realStoreContext()
    const before = useTaskStore.getState()

    expect(() =>
      handleArtifactGenerated(
        {
          id: 'e9',
          type: 'artifact.generated',
          data: {
            task_id: 't1',
            artifact: { id: 'a1', type: 'markdown', content: '# x', title: '报告' },
          },
        } as never,
        context
      )
    ).not.toThrow()

    expect(useTaskStore.getState()).toBe(before)
  })
})
