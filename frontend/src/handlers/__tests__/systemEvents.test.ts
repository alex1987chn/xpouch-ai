import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  handleRouterStart,
  handleRouterDecision,
  handleHumanInterrupt,
  handleError
} from '../systemEvents'
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

describe('System Events', () => {
  let mockContext: HandlerContext

  beforeEach(() => {
    mockContext = {
      taskStore: {
        setMode: vi.fn(),
        resetUI: vi.fn(),
        setPendingPlan: vi.fn(),
        mode: 'simple'
      } as any,
      chatStore: {
        messages: [],
        updateMessageMetadata: vi.fn(),
        lastAssistantMessageId: null
      } as any,
      debug: false
    }
  })

  describe('handleRouterStart', () => {
    it('应该创建 router thinking step', () => {
      const event = {
        id: 'evt-1',
        type: 'router.start' as const,
        data: {
          query: '帮我写一个快速排序算法',
          timestamp: new Date().toISOString()
        }
      }

      mockContext.chatStore.messages = [
        { id: 'msg-1', role: 'assistant', metadata: { thinking: [] } }
      ]
      mockContext.chatStore.lastAssistantMessageId = 'msg-1'

      handleRouterStart(event, mockContext)

      expect(mockContext.chatStore.updateMessageMetadata).toHaveBeenCalledWith(
        'msg-1',
        {
          thinking: [
            expect.objectContaining({
              expertType: 'router',
              expertName: '智能路由',
              status: 'running',
              type: 'analysis'
            })
          ]
        }
      )
    })

    it('应该更新已存在的 router step', () => {
      const event = {
        id: 'evt-2',
        type: 'router.start' as const,
        data: {
          query: '另一个查询',
          timestamp: new Date().toISOString()
        }
      }

      mockContext.chatStore.messages = [
        {
          id: 'msg-1',
          role: 'assistant',
          metadata: {
            thinking: [
              {
                id: 'router-old',
                expertType: 'router',
                expertName: '智能路由',
                content: 'old content',
                status: 'running',
                type: 'analysis'
              }
            ]
          }
        }
      ]
      mockContext.chatStore.lastAssistantMessageId = 'msg-1'

      handleRouterStart(event, mockContext)

      const calls = mockContext.chatStore.updateMessageMetadata.mock.calls
      expect(calls[0][1].thinking).toHaveLength(1)
      expect(calls[0][1].thinking[0].id).toBe('router-evt-2') // 新的 ID
    })
  })

  describe('handleRouterDecision', () => {
    it('应该设置模式并更新 router step', () => {
      const event = {
        id: 'evt-1',
        type: 'router.decision' as const,
        data: {
          decision: 'complex' as const,
          reason: '任务复杂，需要多专家协作'
        }
      }

      mockContext.chatStore.messages = [
        {
          id: 'msg-1',
          role: 'assistant',
          metadata: {
            thinking: [
              {
                expertType: 'router',
                content: 'analyzing...',
                status: 'running'
              }
            ]
          }
        }
      ]
      mockContext.chatStore.lastAssistantMessageId = 'msg-1'

      handleRouterDecision(event, mockContext)

      expect(mockContext.taskStore.setMode).toHaveBeenCalledWith('complex')
      expect(mockContext.chatStore.updateMessageMetadata).toHaveBeenCalledWith(
        'msg-1',
        {
          thinking: [
            expect.objectContaining({
              expertType: 'router',
              status: 'completed',
              content: expect.stringContaining('复杂模式')
            })
          ]
        }
      )
    })

    it('当模式切换时应该重置 UI', () => {
      const event = {
        id: 'evt-1',
        type: 'router.decision' as const,
        data: {
          decision: 'complex' as const,
          reason: 'complex task'
        }
      }

      mockContext.taskStore.mode = 'simple'

      handleRouterDecision(event, mockContext)

      expect(mockContext.taskStore.resetUI).toHaveBeenCalled()
    })

    it('当模式相同时不应该重置 UI', () => {
      const event = {
        id: 'evt-1',
        type: 'router.decision' as const,
        data: {
          decision: 'simple' as const,
          reason: 'simple task'
        }
      }

      mockContext.taskStore.mode = 'simple'

      handleRouterDecision(event, mockContext)

      expect(mockContext.taskStore.resetUI).not.toHaveBeenCalled()
    })

    it('simple 模式应该显示正确的文本', () => {
      const event = {
        id: 'evt-1',
        type: 'router.decision' as const,
        data: {
          decision: 'simple' as const,
          reason: 'simple task'
        }
      }

      mockContext.chatStore.messages = [
        {
          id: 'msg-1',
          role: 'assistant',
          metadata: {
            thinking: [{ expertType: 'router', status: 'running' }]
          }
        }
      ]
      mockContext.chatStore.lastAssistantMessageId = 'msg-1'

      handleRouterDecision(event, mockContext)

      const calls = mockContext.chatStore.updateMessageMetadata.mock.calls
      expect(calls[0][1].thinking[0].content).toContain('简单模式')
    })
  })

  describe('handleHumanInterrupt', () => {
    it('应该将计划存入 Store', () => {
      const event = {
        id: 'evt-1',
        type: 'human.interrupt' as const,
        data: {
          interrupt_type: 'plan_review' as const,
          current_plan: [
            { id: 'task-1', description: 'step 1' },
            { id: 'task-2', description: 'step 2' }
          ],
          message: '请审核任务计划'
        }
      }

      handleHumanInterrupt(event, mockContext)

      expect(mockContext.taskStore.setPendingPlan).toHaveBeenCalledWith(
        event.data.current_plan
      )
    })

    it('当计划为空时应该记录警告', async () => {
      const { logger } = vi.mocked(await import('@/utils/logger'), true)
      
      const event = {
        id: 'evt-1',
        type: 'human.interrupt' as const,
        data: {
          interrupt_type: 'plan_review' as const,
          current_plan: [],
          message: '请审核'
        }
      }

      handleHumanInterrupt(event, mockContext)

      expect(mockContext.taskStore.setPendingPlan).not.toHaveBeenCalled()
      expect(logger.warn).toHaveBeenCalled()
    })

    it('当 data 为空时应该记录警告', async () => {
      const { logger } = vi.mocked(await import('@/utils/logger'), true)
      
      const event = {
        id: 'evt-1',
        type: 'human.interrupt' as const,
        data: null as any
      }

      handleHumanInterrupt(event, mockContext)

      expect(mockContext.taskStore.setPendingPlan).not.toHaveBeenCalled()
      expect(logger.warn).toHaveBeenCalled()
    })
  })

  describe('handleError', () => {
    it('应该记录服务器错误', async () => {
      const { logger } = vi.mocked(await import('@/utils/logger'), true)
      
      const event = {
        id: 'evt-1',
        type: 'error' as const,
        data: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        }
      }

      handleError(event, mockContext)

      expect(logger.error).toHaveBeenCalledWith(
        '[SystemEvents] 服务器错误:',
        'INTERNAL_ERROR',
        '服务器内部错误'
      )
    })
  })
})
