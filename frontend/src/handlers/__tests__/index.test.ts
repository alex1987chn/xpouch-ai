import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  EventHandler,
  getEventHandler,
  handleServerEvent
} from '../index'

// Mock stores
const mockTaskStore = {
  initializePlan: vi.fn(),
  setIsInitialized: vi.fn(),
  setMode: vi.fn()
}

const mockChatStore = {
  messages: [],
  updateMessageMetadata: vi.fn()
}

vi.mock('@/store/taskStore', () => ({
  useTaskStore: {
    getState: () => mockTaskStore
  }
}))

vi.mock('@/store/chatStore', () => ({
  useChatStore: {
    getState: () => mockChatStore
  }
}))

// Mock logger
vi.mock('@/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn()
  }
}))

describe('EventHandler', () => {
  let handler: EventHandler

  beforeEach(() => {
    handler = new EventHandler()
    vi.clearAllMocks()
  })

  afterEach(() => {
    getEventHandler().clearProcessedEvents()
  })

  describe('事件去重', () => {
    it('应该跳过重复事件', () => {
      const event = {
        id: 'evt-1',
        type: 'plan.created' as const,
        data: { execution_plan_id: 's1', tasks: [] }
      }

      handler.handle(event)
      handler.handle(event) // 重复

      expect(mockTaskStore.initializePlan).toHaveBeenCalledTimes(1)
    })

    it('应该限制已处理事件数量', () => {
      // 添加 1001 个不同的事件
      for (let i = 0; i < 1001; i++) {
        handler.handle({
          id: `evt-${i}`,
          type: 'error' as const,
          data: { code: 'TEST', message: 'test' }
        })
      }

      // 第一个事件应该被移除，可以再次处理
      handler.handle({
        id: 'evt-0',
        type: 'plan.created' as const,
        data: { execution_plan_id: 's1', tasks: [] }
      })

      expect(mockTaskStore.initializePlan).toHaveBeenCalledTimes(1)
    })
  })

  describe('事件分发', () => {
    it('应该根据类型分发到正确的处理器', () => {
      const planCreatedEvent = {
        id: 'evt-1',
        type: 'plan.created' as const,
        data: { execution_plan_id: 's1', tasks: [] }
      }

      handler.handle(planCreatedEvent)

      expect(mockTaskStore.initializePlan).toHaveBeenCalledWith(planCreatedEvent.data)
      expect(mockTaskStore.setIsInitialized).toHaveBeenCalledWith(true)
      expect(mockTaskStore.setMode).toHaveBeenCalledWith('complex')
    })

    it('应该处理未知事件类型', async () => {
      const { logger } = vi.mocked(await import('@/utils/logger'), true)

      handler.handle({
        id: 'evt-1',
        type: 'unknown.event' as any,
        data: {}
      })

      expect(logger.warn).toHaveBeenCalledWith(
        '[EventHandler] 未知事件类型:',
        'unknown.event'
      )
    })
  })

  describe('clearProcessedEvents', () => {
    it('应该清空已处理事件记录', () => {
      const event = {
        id: 'evt-1',
        type: 'plan.created' as const,
        data: { execution_plan_id: 's1', tasks: [] }
      }

      handler.handle(event)
      handler.clearProcessedEvents()
      handler.handle(event) // 可以再次处理

      expect(mockTaskStore.initializePlan).toHaveBeenCalledTimes(2)
    })
  })
})

describe('便捷函数', () => {
  afterEach(() => {
    getEventHandler().clearProcessedEvents()
    vi.clearAllMocks()
  })

  describe('getEventHandler', () => {
    it('应该返回单例实例', () => {
      const h1 = getEventHandler()
      const h2 = getEventHandler()

      expect(h1).toBe(h2)
    })
  })

  describe('handleServerEvent', () => {
    it('应该处理单个事件', () => {
      const event = {
        id: 'evt-1',
        type: 'plan.created' as const,
        data: { execution_plan_id: 's1', tasks: [] }
      }

      handleServerEvent(event)

      expect(mockTaskStore.initializePlan).toHaveBeenCalledWith(event.data)
    })
  })

  describe('单例状态清理', () => {
    it('clearProcessedEvents 应清空单例的去重记录', () => {
      const event = {
        id: 'evt-1',
        type: 'plan.created' as const,
        data: { execution_plan_id: 's1', tasks: [] }
      }

      handleServerEvent(event)
      getEventHandler().clearProcessedEvents()
      handleServerEvent(event) // 可以再次处理

      expect(mockTaskStore.initializePlan).toHaveBeenCalledTimes(2)
    })
  })
})
