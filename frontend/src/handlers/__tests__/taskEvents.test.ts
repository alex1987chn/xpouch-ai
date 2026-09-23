import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  handlePlanCreated,
  handlePlanStarted,
  handlePlanThinking,
  handleTaskStarted,
  handleTaskCompleted,
  handleTaskFailed
} from '../taskEvents'
import type { HandlerContext } from '../types'

// Mock logger
vi.mock('@/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn()
  }
}))

describe('Task Events', () => {
  let mockContext: HandlerContext

  beforeEach(() => {
    mockContext = {
      // 只 mock 仍然存在的动作。2026-09-13 清理后，任务事件处理器不再写
      // 「本地任务副本」（tasks Map / tasksCache / progress）；2026-09-14 进一步
      // 删除 PlanningSlice（planThinkingContent 只写不读），处理器只维护
      // runningTaskIds 与思考步骤。
      taskStore: {
        setMode: vi.fn(),
        addRunningTaskId: vi.fn(),
        removeRunningTaskId: vi.fn()
      } as any,
      chatStore: {
        messages: [],
        updateMessageMetadata: vi.fn(),
        renameMessageId: vi.fn(),
        lastAssistantMessageId: null
      } as any,
      debug: false
    }
  })

  describe('handlePlanCreated', () => {
    it('应该初始化任务计划并设置模式', () => {
      const event = {
        id: 'evt-1',
        type: 'plan.created' as const,
        data: {
          execution_plan_id: 'session-1',
          tasks: [{ id: 'task-1', description: 'test' }]
        }
      }

      handlePlanCreated(event, mockContext)

      expect(mockContext.taskStore.setMode).toHaveBeenCalledWith('complex')
    })

    it('携带载体 message_id 时把占位消息原位改写成库内 id（两态同源锚点）', () => {
      const event = {
        id: 'evt-2',
        type: 'plan.created' as const,
        data: {
          execution_plan_id: 'session-2',
          tasks: [{ id: 'task-1', description: 'test' }],
          message_id: 2470
        }
      }
      mockContext.chatStore.messages = [
        { id: 'local-placeholder', role: 'assistant', content: '', metadata: { thinking: [] } }
      ]
      mockContext.chatStore.lastAssistantMessageId = 'local-placeholder'

      handlePlanCreated(event, mockContext)

      expect(mockContext.chatStore.renameMessageId).toHaveBeenCalledWith('local-placeholder', '2470')
    })

    it('无载体 id（插入失败兜底）不改写占位消息', () => {
      const event = {
        id: 'evt-3',
        type: 'plan.created' as const,
        data: {
          execution_plan_id: 'session-3',
          tasks: [{ id: 'task-1', description: 'test' }]
        }
      }
      mockContext.chatStore.messages = [
        { id: 'local-placeholder', role: 'assistant', content: '', metadata: { thinking: [] } }
      ]
      mockContext.chatStore.lastAssistantMessageId = 'local-placeholder'

      handlePlanCreated(event, mockContext)

      expect(mockContext.chatStore.renameMessageId).not.toHaveBeenCalled()
    })
  })

  describe('handlePlanStarted', () => {
    it('创建 thinking step，不触碰 taskStore（PlanningSlice 已删，评审 M5）', () => {
      const event = {
        id: 'evt-1',
        type: 'plan.started' as const,
        data: { execution_plan_id: 'session-1' }
      }

      mockContext.chatStore.messages = [
        { id: 'msg-1', role: 'assistant', metadata: { thinking: [] } }
      ]
      mockContext.chatStore.lastAssistantMessageId = 'msg-1'

      handlePlanStarted(event, mockContext)

      expect(mockContext.taskStore.startPlan).toBeUndefined()
      expect(mockContext.chatStore.updateMessageMetadata).toHaveBeenCalled()
    })
  })

  describe('handlePlanThinking', () => {
    it('追加 delta 到 thinking content，不触碰 taskStore（PlanningSlice 已删，评审 M5）', () => {
      const event = {
        id: 'evt-1',
        type: 'plan.thinking' as const,
        data: { execution_plan_id: 'session-1', delta: 'new content' }
      }

      mockContext.chatStore.messages = [
        {
          id: 'msg-1',
          role: 'assistant',
          metadata: {
            thinking: [
              { type: 'planning', content: 'existing ', status: 'running' }
            ]
          }
        }
      ]
      mockContext.chatStore.lastAssistantMessageId = 'msg-1'

      handlePlanThinking(event, mockContext)

      expect(mockContext.taskStore.appendPlanThinking).toBeUndefined()
      expect(mockContext.chatStore.updateMessageMetadata).toHaveBeenCalledWith(
        'msg-1',
        expect.objectContaining({
          thinking: expect.arrayContaining([
            expect.objectContaining({ content: 'existing new content' })
          ])
        })
      )
    })
  })

  describe('handleTaskStarted', () => {
    it('应该启动任务并添加 running task ID（有 message_id 时外加专家消息）', () => {
      const event = {
        id: 'evt-1',
        type: 'task.started' as const,
        data: {
          task_id: 'task-1',
          expert_type: 'coder',
          description: 'write code',
          started_at: new Date().toISOString(),
          message_id: 101,
          sort_order: 1,
          total_steps: 2
        }
      }

      mockContext.chatStore.addMessage = vi.fn()

      handleTaskStarted(event, mockContext)

      expect(mockContext.taskStore.addRunningTaskId).toHaveBeenCalledWith('task-1')
      expect(mockContext.chatStore.addMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          id: '101',
          role: 'assistant',
          extra_data: expect.objectContaining({
            message_kind: 'expert_result',
            task_id: 'task-1',
            status: 'running'
          })
        })
      )
    })

    it('message_id 为空时不加专家消息（后端插入失败时不造双轨数据）', () => {
      const event = {
        id: 'evt-2',
        type: 'task.started' as const,
        data: {
          task_id: 'task-1',
          expert_type: 'coder',
          description: 'write code',
          started_at: new Date().toISOString()
        }
      }

      mockContext.chatStore.addMessage = vi.fn()

      handleTaskStarted(event, mockContext)

      expect(mockContext.chatStore.addMessage).not.toHaveBeenCalled()
    })

    it('不应该重复添加已存在的 thinking step', () => {
      const event = {
        id: 'evt-1',
        type: 'task.started' as const,
        data: {
          task_id: 'task-1',
          expert_type: 'coder',
          description: 'write code',
          started_at: new Date().toISOString()
        }
      }

      mockContext.chatStore.messages = [
        {
          id: 'msg-1',
          role: 'assistant',
          metadata: {
            thinking: [{ id: 'task-1', type: 'execution', status: 'running' }]
          }
        }
      ]
      mockContext.chatStore.lastAssistantMessageId = 'msg-1'

      handleTaskStarted(event, mockContext)

      // updateMessageMetadata 不应该被调用，因为 thinking step 已存在
      expect(mockContext.chatStore.updateMessageMetadata).not.toHaveBeenCalled()
    })
  })

  describe('handleTaskCompleted', () => {
    it('应该释放运行中标记并把专家消息覆盖为终态（事件载荷=库内终态）', () => {
      const event = {
        id: 'evt-1',
        type: 'task.completed' as const,
        data: {
          task_id: 'task-1',
          expert_type: 'coder',
          description: 'write code',
          output: 'completed result',
          duration_ms: 5000,
          completed_at: new Date().toISOString(),
          message_id: 101,
          artifact_ids: ['art-1'],
          tool_stats: { count: 3, total_ms: 2100, failed: 0 }
        }
      }

      mockContext.chatStore.updateMessageExtra = vi.fn()

      handleTaskCompleted(event, mockContext)

      expect(mockContext.taskStore.removeRunningTaskId).toHaveBeenCalledWith('task-1')
      expect(mockContext.chatStore.updateMessageExtra).toHaveBeenCalledWith(
        '101',
        expect.objectContaining({
          status: 'completed',
          artifact_ids: ['art-1'],
          tool_stats: { count: 3, total_ms: 2100, failed: 0 },
          duration_ms: 5000
        })
      )
    })
  })

  describe('handleTaskFailed', () => {
    it('应该标记任务失败并记录错误', () => {
      const event = {
        id: 'evt-1',
        type: 'task.failed' as const,
        data: {
          task_id: 'task-1',
          error: 'something went wrong',
          failed_at: new Date().toISOString()
        }
      }

      handleTaskFailed(event, mockContext)

      expect(mockContext.taskStore.removeRunningTaskId).toHaveBeenCalledWith('task-1')
    })
  })
})
