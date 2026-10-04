/**
 * 执行态转换的投影契约（Phase C 唯一写入入口）。
 *
 * 重点钉住「谁不能清什么」：
 * - endStream 在等待审批时只终结生成态——审批卡可见性（waiting）与轮询
 *   锚点（activeRunId）是 run 的真相，流收尾不构成撤卡理由。
 *   （2026-10-04 回归案底：finalizeStream 直调 endExecution，初始发送打到
 *   审批点时审批卡被当场撤下，页面停在规划帧，用户只能重进会话救回）
 * - abandonTracking 同理：前端跟丢只放弃接管，不撤审批卡。
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { useChatStore } from '../chatStore'
import { useTaskStore } from '../taskStore'
import {
  abandonTracking,
  beginStreaming,
  endExecution,
  endStream,
} from '../executionState'

function projections() {
  const chat = useChatStore.getState()
  const task = useTaskStore.getState()
  return {
    isGenerating: chat.isGenerating,
    isWaitingForApproval: task.isWaitingForApproval,
    activeRunId: task.activeRunId,
  }
}

describe('executionState 转换', () => {
  beforeEach(() => {
    useChatStore.setState({ isGenerating: false })
    useTaskStore.setState({ isWaitingForApproval: false, activeRunId: null })
  })

  it('endStream：等待审批时只终结生成态，审批卡与 runId 保留（回归契约）', () => {
    beginStreaming('run-1')
    // 事件面 setPendingPlan 落下的 run 真相（slice 内置 waiting=true）
    useTaskStore.getState().setIsWaitingForApproval(true)

    endStream()

    expect(projections()).toEqual({
      isGenerating: false,
      isWaitingForApproval: true,
      activeRunId: 'run-1',
    })
  })

  it('endStream：非等待时等价 endExecution（三投影归零）', () => {
    beginStreaming('run-1')

    endStream()

    expect(projections()).toEqual({
      isGenerating: false,
      isWaitingForApproval: false,
      activeRunId: null,
    })
  })

  it('endStream：keepRunId 在非等待路径仍然生效', () => {
    beginStreaming('run-1')

    endStream({ keepRunId: true })

    expect(projections().activeRunId).toBe('run-1')
  })

  it('abandonTracking：只放弃接管，不撤审批卡', () => {
    beginStreaming('run-1')
    useTaskStore.getState().setIsWaitingForApproval(true)

    abandonTracking()

    expect(projections()).toEqual({
      isGenerating: false,
      isWaitingForApproval: true,
      activeRunId: null,
    })
  })

  it('endExecution：三投影归零（对照，与 endStream 非等待路径一致）', () => {
    beginStreaming('run-1')
    useTaskStore.getState().setIsWaitingForApproval(true)

    endExecution()

    expect(projections()).toEqual({
      isGenerating: false,
      isWaitingForApproval: false,
      activeRunId: null,
    })
  })
})
