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
      taskStore: {
        initializePlan: vi.fn(),
        setIsInitialized: vi.fn(),
        setMode: vi.fn(),
        startPlan: vi.fn(),
        appendPlanThinking: vi.fn(),
        startTask: vi.fn(),
        addRunningTaskId: vi.fn(),
        completeTask: vi.fn(),
        setProgress: vi.fn(),
        removeRunningTaskId: vi.fn(),
        failTask: vi.fn(),
        tasksCache: [],
        tasks: new Map()
      } as any,
      chatStore: {
        messages: [],
        updateMessageMetadata: vi.fn(),
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
          session_id: 'session-1',
          tasks: [{ id: 'task-1', description: 'test' }]
        }
      }

      handlePlanCreated(event, mockContext)

      expect(mockContext.taskStore.initializePlan).toHaveBeenCalledWith(event.data)
      expect(mockContext.taskStore.setIsInitialized).toHaveBeenCalledWith(true)
      expect(mockContext.taskStore.setMode).toHaveBeenCalledWith('complex')
    })
  })

  describe('handlePlanStarted', () => {
    it('应该调用 startPlan 并创建 thinking step', () => {
      const event = {
        id: 'evt-1',
        type: 'plan.started' as const,
        data: { session_id: 'session-1' }
      }

      mockContext.chatStore.messages = [
        { id: 'msg-1', role: 'assistant', metadata: { thinking: [] } }
      ]
      mockContext.chatStore.lastAssistantMessageId = 'msg-1'

      handlePlanStarted(event, mockContext)

      expect(mockContext.taskStore.startPlan).toHaveBeenCalledWith(event.data)
      expect(mockContext.chatStore.updateMessageMetadata).toHaveBeenCalled()
    })
  })

  describe('handlePlanThinking', () => {
    it('应该追加 delta 到 thinking content', () => {
      const event = {
        id: 'evt-1',
        type: 'plan.thinking' as const,
        data: { session_id: 'session-1', delta: 'new content' }
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

      expect(mockContext.taskStore.appendPlanThinking).toHaveBeenCalledWith(event.data)
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
    it('应该启动任务并添加 running task ID', () => {
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
        { id: 'msg-1', role: 'assistant', metadata: { thinking: [] } }
      ]
      mockContext.chatStore.lastAssistantMessageId = 'msg-1'

      handleTaskStarted(event, mockContext)

      expect(mockContext.taskStore.startTask).toHaveBeenCalledWith(event.data)
      expect(mockContext.taskStore.addRunningTaskId).toHaveBeenCalledWith('task-1')
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

      expect(mockContext.taskStore.startTask).toHaveBeenCalledWith(event.data)
      // updateMessageMetadata 不应该被调用，因为 thinking step 已存在
      expect(mockContext.chatStore.updateMessageMetadata).not.toHaveBeenCalled()
    })
  })

  describe('handleTaskCompleted', () => {
    it('应该完成任务并更新进度', () => {
      const event = {
        id: 'evt-1',
        type: 'task.completed' as const,
        data: {
          task_id: 'task-1',
          output: 'completed result',
          completed_at: new Date().toISOString()
        }
      }

      mockContext.taskStore.tasksCache = [
        { id: 'task-1', status: 'completed' },
        { id: 'task-2', status: 'pending' }
      ] as any

      mockContext.chatStore.messages = [
        {
          id: 'msg-1',
          role: 'assistant',
          metadata: {
            thinking: [
              { id: 'task-1', type: 'execution', status: 'running', content: '' }
            ]
          }
        }
      ]
      mockContext.chatStore.lastAssistantMessageId = 'msg-1'

      handleTaskCompleted(event, mockContext)

      expect(mockContext.taskStore.completeTask).toHaveBeenCalledWith(event.data)
      expect(mockContext.taskStore.removeRunningTaskId).toHaveBeenCalledWith('task-1')
      expect(mockContext.taskStore.setProgress).toHaveBeenCalledWith({ current: 1, total: 2 })
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

      expect(mockContext.taskStore.failTask).toHaveBeenCalledWith(event.data)
      expect(mockContext.taskStore.removeRunningTaskId).toHaveBeenCalledWith('task-1')
    })
  })
})
