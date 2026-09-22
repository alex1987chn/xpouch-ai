/**
 * H5 回归：SSE 全局分发点的会话归属守卫。
 *
 * 场景（用户实测报出）：流式进行中切换会话，已在管道里的旧流帧仍会走
 * handleServerEvent——兜底 addMessage 不带 threadId，绕开 chatStore 的 P4-1
 * 守卫，把旧线程的半截回答串进新会话。修复后，分发点在流所属会话 ≠ 当前
 * 会话时整体切断（onChunk 自有守卫不受影响）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const fetchEventSourceMock = vi.fn()

vi.mock('@microsoft/fetch-event-source', () => ({
  fetchEventSource: (...args: unknown[]) => fetchEventSourceMock(...args),
}))

import { useChatStore } from '@/store/chatStore'
import { sendMessage } from '@/services/chat'

type MessageHandler = (msg: { id: string; event: string; data: string }) => void

/** 捕获注册进 fetchEventSource 的 onmessage，让测试能手动喂帧 */
let capturedOnMessage: MessageHandler | null = null

describe('SSE 分发点会话归属守卫（评审 H5）', () => {
  beforeEach(() => {
    capturedOnMessage = null
    fetchEventSourceMock.mockImplementation(async (_url: string, opts: Record<string, unknown>) => {
      capturedOnMessage = opts.onmessage as MessageHandler
      // 挂住不返回：流保持“打开”状态，由测试手动喂帧
      await new Promise(() => {})
    })
    useChatStore.setState({ currentThreadId: 'thread-A', messages: [] })
  })

  it('流所属会话已切走时，帧不再进全局分发（不产生兜底消息）', async () => {
    const p = sendMessage(
      [{ id: 'm1', role: 'user', content: 'hi', timestamp: Date.now() }],
      'default-chat',
      vi.fn(),
      'thread-A',
    )

    // 等待 fetchEventSource 被调用并捕获 onmessage
    await vi.waitFor(() => expect(capturedOnMessage).not.toBeNull())

    // 用户切到会话 B
    useChatStore.setState({ currentThreadId: 'thread-B', messages: [] })

    // 旧流（thread-A）的一帧 delta 到达：message_id 未知 → 若无守卫会兜底 addMessage
    await capturedOnMessage!({
      id: '1',
      event: 'message.delta',
      data: JSON.stringify({ message_id: 'm-old', content: '旧线程的半截回答' }),
    })

    // 当前会话 B 的消息列表不得出现旧流内容
    const messages = useChatStore.getState().messages
    expect(messages.find(m => m.id === 'm-old')).toBeUndefined()

    // 收尾：让挂住的连接结束，避免测试悬挂
    fetchEventSourceMock.mockImplementation(async () => {})
    p.catch(() => {})
  })
})
