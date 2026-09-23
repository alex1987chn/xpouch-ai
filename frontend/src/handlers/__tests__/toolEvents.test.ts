import { describe, it, expect, vi } from 'vitest'
import { handleToolCalling, handleToolResult } from '../toolEvents'
import type { HandlerContext } from '../types'
import type { ExpertMessageData, Message } from '@/types'

// Mock logger
vi.mock('@/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn()
  }
}))

/** 构造带专家消息的 chatStore：updateMessageMetadata 真实落状态（跨调用可见） */
function makeContextWithExpertMessage(): {
  context: HandlerContext
  messages: Message[]
  updateMetadata: ReturnType<typeof vi.fn>
} {
  const expertMessage: Message = {
    id: '101',
    role: 'assistant',
    content: '调研任务',
    extra_data: {
      message_kind: 'expert_result',
      expert_type: 'search',
      task_id: 'task-1',
      task_description: '调研任务',
      sort_order: 1,
      total_steps: 2,
      status: 'running',
    } satisfies ExpertMessageData,
  }
  const messages: Message[] = [expertMessage]
  const updateMetadata = vi.fn((id: string, metadata: Partial<Message['metadata']>) => {
    const msg = messages.find(m => String(m.id) === id)
    if (msg) Object.assign((msg.metadata ??= {}), metadata)
  })
  return {
    context: {
      taskStore: {} as never,
      chatStore: {
        messages,
        updateMessageMetadata: updateMetadata,
      } as never,
      debug: false,
    },
    messages,
    updateMetadata,
  }
}

describe('Tool Events（挂专家消息的运行时 toolActivity）', () => {
  it('tool.calling 把当前工具活动写进对应专家消息的 metadata', () => {
    const { context, messages } = makeContextWithExpertMessage()
    handleToolCalling(
      {
        id: 'e1',
        type: 'tool.calling' as const,
        timestamp: '',
        data: {
          task_id: 'task-1',
          expert_type: 'search',
          tool: 'asearch_web',
          source: 'builtin' as const,
          args_summary: '',
          attempt: 1,
        },
      } as never,
      context
    )

    expect(messages[0].metadata?.toolActivity).toEqual({
      tool: 'asearch_web',
      source: 'builtin',
      state: 'calling',
      attempt: 1,
    })
  })

  it('tool.result 覆盖同工具的 calling 态并带耗时成败', () => {
    const { context, messages } = makeContextWithExpertMessage()
    handleToolCalling(
      {
        id: 'e1', type: 'tool.calling' as const, timestamp: '',
        data: { task_id: 'task-1', expert_type: 'search', tool: 'asearch_web', source: 'builtin' as const, args_summary: '', attempt: 1 },
      } as never,
      context
    )
    handleToolResult(
      {
        id: 'e2', type: 'tool.result' as const, timestamp: '',
        data: { task_id: 'task-1', expert_type: 'search', tool: 'asearch_web', source: 'builtin' as const, success: true, duration_ms: 2210 },
      } as never,
      context
    )

    expect(messages[0].metadata?.toolActivity).toMatchObject({
      state: 'done',
      durationMs: 2210,
      success: true,
    })
  })

  it('迟到的不相关工具 result 不覆盖当前 calling（乱序防护）', () => {
    const { context, messages } = makeContextWithExpertMessage()
    handleToolCalling(
      {
        id: 'e3', type: 'tool.calling' as const, timestamp: '',
        data: { task_id: 'task-1', expert_type: 'search', tool: 'maps_geo', source: 'mcp' as const, args_summary: '', attempt: 2 },
      } as never,
      context
    )
    handleToolResult(
      {
        id: 'e4', type: 'tool.result' as const, timestamp: '',
        data: { task_id: 'task-1', expert_type: 'search', tool: 'asearch_web', source: 'builtin' as const, success: true, duration_ms: 100 },
      } as never,
      context
    )

    expect(messages[0].metadata?.toolActivity).toMatchObject({
      tool: 'maps_geo',
      state: 'calling',
      attempt: 2,
    })
  })

  it('task_id 不匹配任何专家消息时不写入', () => {
    const { context, updateMetadata } = makeContextWithExpertMessage()
    handleToolCalling(
      {
        id: 'e5', type: 'tool.calling' as const, timestamp: '',
        data: { task_id: 'task-other', expert_type: 'search', tool: 'asearch_web', source: 'builtin' as const, args_summary: '', attempt: 1 },
      } as never,
      context
    )

    expect(updateMetadata.mock.calls.length).toBe(0)
  })
})
