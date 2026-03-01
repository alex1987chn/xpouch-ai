import { describe, it, expect, vi } from 'vitest'
import { getLastAssistantMessage } from '../utils'

describe('getLastAssistantMessage', () => {
  const createMockChatStore = (overrides = {}) => ({
    lastAssistantMessageId: null as string | null,
    messages: [] as any[],
    ...overrides
  })

  it('应该优先使用缓存的 lastAssistantMessageId', () => {
    const mockMessage = { id: 'msg-1', role: 'assistant', content: 'test' }
    const chatStore = createMockChatStore({
      lastAssistantMessageId: 'msg-1',
      messages: [mockMessage, { id: 'msg-2', role: 'user', content: 'hi' }]
    })

    const result = getLastAssistantMessage(chatStore as any)

    expect(result).toEqual({ message: mockMessage, id: 'msg-1' })
  })

  it('当缓存ID找不到消息时应该降级遍历查找', () => {
    const mockMessage = { id: 'msg-2', role: 'assistant', content: 'test' }
    const chatStore = createMockChatStore({
      lastAssistantMessageId: 'invalid-id',
      messages: [{ id: 'msg-1', role: 'user', content: 'hi' }, mockMessage]
    })

    const result = getLastAssistantMessage(chatStore as any)

    expect(result).toEqual({ message: mockMessage, id: 'msg-2' })
  })

  it('当没有助手消息时应该返回 null', () => {
    const chatStore = createMockChatStore({
      lastAssistantMessageId: null,
      messages: [
        { id: 'msg-1', role: 'user', content: 'hi' },
        { id: 'msg-2', role: 'user', content: 'hello' }
      ]
    })

    const result = getLastAssistantMessage(chatStore as any)

    expect(result).toBeNull()
  })

  it('应该返回最后一条助手消息（倒序查找）', () => {
    const chatStore = createMockChatStore({
      lastAssistantMessageId: null,
      messages: [
        { id: 'msg-1', role: 'assistant', content: 'first' },
        { id: 'msg-2', role: 'user', content: 'hi' },
        { id: 'msg-3', role: 'assistant', content: 'last' }
      ]
    })

    const result = getLastAssistantMessage(chatStore as any)

    expect(result?.id).toBe('msg-3')
    expect(result?.message.content).toBe('last')
  })
})
