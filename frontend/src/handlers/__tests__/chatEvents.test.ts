import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  handleMessageDelta,
  handleMessageDone,
  clearProcessedMessageDones
} from '../chatEvents'
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

describe('Chat Events', () => {
  let mockContext: HandlerContext

  beforeEach(() => {
    clearProcessedMessageDones()
    mockContext = {
      taskStore: {} as any,
      chatStore: {
        messages: [],
        updateMessage: vi.fn(),
        updateMessageMetadata: vi.fn(),
        addMessage: vi.fn()
      } as any,
      debug: false
    }
  })

  describe('handleMessageDelta', () => {
    it('当消息不存在时应该自动创建消息', () => {
      const event = {
        id: 'evt-1',
        type: 'message.delta' as const,
        data: {
          message_id: 'msg-new',
          content: 'delta content'
        }
      }

      mockContext.chatStore.messages = [{ id: 'other', role: 'user', content: 'hi' }]
      mockContext.debug = true

      handleMessageDelta(event, mockContext)

      expect(mockContext.chatStore.addMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'msg-new',
          role: 'assistant',
          content: 'delta content'
        })
      )
    })

    it('当消息存在时不应该重复更新', () => {
      const event = {
        id: 'evt-1',
        type: 'message.delta' as const,
        data: {
          message_id: 'msg-1',
          content: 'delta'
        }
      }

      mockContext.chatStore.messages = [
        { id: 'msg-1', role: 'assistant', content: 'existing' }
      ]
      mockContext.debug = true

      handleMessageDelta(event, mockContext)

      expect(mockContext.chatStore.addMessage).not.toHaveBeenCalled()
      expect(mockContext.chatStore.updateMessage).not.toHaveBeenCalled()
    })
  })

  describe('handleMessageDone', () => {
    it('应该用后端返回的完整内容覆盖前端累积内容', () => {
      const event = {
        id: 'evt-1',
        type: 'message.done' as const,
        data: {
          message_id: 'msg-1',
          full_content: 'complete content from server'
        }
      }

      mockContext.chatStore.messages = [
        { id: 'msg-1', role: 'assistant', content: 'partial' }
      ]

      handleMessageDone(event, mockContext)

      expect(mockContext.chatStore.updateMessage).toHaveBeenCalledWith(
        'msg-1',
        'complete content from server',
        false
      )
    })

    it('应该合并 thinking 数据而不是覆盖', () => {
      const event = {
        id: 'evt-1',
        type: 'message.done' as const,
        data: {
          message_id: 'msg-1',
          full_content: 'content',
          thinking: {
            steps: [
              { id: 'step-2', type: 'analysis', status: 'completed' }
            ]
          }
        }
      }

      mockContext.chatStore.messages = [
        {
          id: 'msg-1',
          role: 'assistant',
          content: 'partial',
          metadata: {
            thinking: [{ id: 'step-1', type: 'planning', status: 'completed' }]
          }
        }
      ]

      handleMessageDone(event, mockContext)

      expect(mockContext.chatStore.updateMessageMetadata).toHaveBeenCalledWith(
        'msg-1',
        {
          thinking: [
            { id: 'step-1', type: 'planning', status: 'completed' },
            { id: 'step-2', type: 'analysis', status: 'completed' }
          ]
        }
      )
    })

    it('应该去重 thinking steps', () => {
      const event = {
        id: 'evt-1',
        type: 'message.done' as const,
        data: {
          message_id: 'msg-1',
          full_content: 'content',
          thinking: {
            steps: [
              { id: 'step-1', type: 'planning', status: 'completed' } // 已存在
            ]
          }
        }
      }

      mockContext.chatStore.messages = [
        {
          id: 'msg-1',
          role: 'assistant',
          content: 'partial',
          metadata: {
            thinking: [{ id: 'step-1', type: 'planning', status: 'running' }]
          }
        }
      ]

      handleMessageDone(event, mockContext)

      // 不应该添加重复的 step-1
      expect(mockContext.chatStore.updateMessageMetadata).toHaveBeenCalledWith(
        'msg-1',
        {
          thinking: [{ id: 'step-1', type: 'planning', status: 'running' }]
        }
      )
    })

    it('应该将所有 running 状态的 thinking steps 标记为 completed', () => {
      const event = {
        id: 'evt-1',
        type: 'message.done' as const,
        data: {
          message_id: 'msg-1',
          full_content: 'content'
        }
      }

      mockContext.chatStore.messages = [
        {
          id: 'msg-1',
          role: 'assistant',
          content: 'partial',
          metadata: {
            thinking: [
              { id: 'step-1', type: 'planning', status: 'running' },
              { id: 'step-2', type: 'execution', status: 'running' },
              { id: 'step-3', type: 'analysis', status: 'completed' }
            ]
          }
        }
      ]

      handleMessageDone(event, mockContext)

      expect(mockContext.chatStore.updateMessageMetadata).toHaveBeenCalledWith(
        'msg-1',
        {
          thinking: [
            { id: 'step-1', type: 'planning', status: 'completed' },
            { id: 'step-2', type: 'execution', status: 'completed' },
            { id: 'step-3', type: 'analysis', status: 'completed' }
          ]
        }
      )
    })

    it('不应该修改已 completed 的 thinking steps', () => {
      const event = {
        id: 'evt-1',
        type: 'message.done' as const,
        data: {
          message_id: 'msg-1',
          full_content: 'content'
        }
      }

      mockContext.chatStore.messages = [
        {
          id: 'msg-1',
          role: 'assistant',
          content: 'partial',
          metadata: {
            thinking: [
              { id: 'step-1', type: 'planning', status: 'completed' },
              { id: 'step-2', type: 'execution', status: 'completed' }
            ]
          }
        }
      ]

      handleMessageDone(event, mockContext)

      // 所有 steps 已经是 completed，不需要更新
      const calls = mockContext.chatStore.updateMessageMetadata.mock.calls
      const hasCompletedUpdate = calls.some(
        (call: any[]) =>
          call[1].thinking?.every((s: any) => s.status === 'completed') &&
          call[1].thinking?.length === 2
      )
      expect(hasCompletedUpdate).toBe(false)
    })

    it('应该防重处理，忽略重复事件', () => {
      const event = {
        id: 'evt-1',
        type: 'message.done' as const,
        data: {
          message_id: 'msg-1',
          full_content: 'content'
        }
      }

      mockContext.chatStore.messages = [
        { id: 'msg-1', role: 'assistant', content: 'partial' }
      ]

      // 第一次处理
      handleMessageDone(event, mockContext)
      expect(mockContext.chatStore.updateMessage).toHaveBeenCalledTimes(1)

      // 第二次处理（重复）
      handleMessageDone(event, mockContext)
      expect(mockContext.chatStore.updateMessage).toHaveBeenCalledTimes(1) // 不应该增加
    })
  })
})
