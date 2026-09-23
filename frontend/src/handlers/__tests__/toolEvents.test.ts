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

describe('Tool Events（挂专家消息的运行时活动序列 toolCalls）', () => {
  it('tool.calling 逐次追加活动项（序列累积，不是只记当前）', () => {
    const { context, messages } = makeContextWithExpertMessage()
    handleToolCalling(
      {
        id: 'e1', type: 'tool.calling' as const, timestamp: '',
        data: { task_id: 'task-1', expert_type: 'search', tool: 'asearch_web', source: 'builtin' as const, args_summary: '', attempt: 1 },
      } as never,
      context
    )
    handleToolCalling(
      {
        id: 'e2', type: 'tool.calling' as const, timestamp: '',
        data: { task_id: 'task-1', expert_type: 'search', tool: 'maps_geo', source: 'mcp' as const, args_summary: '', attempt: 1 },
      } as never,
      context
    )

    expect(messages[0].metadata?.toolCalls).toEqual([
      { tool: 'asearch_web', source: 'builtin', status: 'calling' },
      { tool: 'maps_geo', source: 'mcp', status: 'calling' },
    ])
  })

  it('tool.result 把同工具最后一个 calling 项转为 done（带耗时成败）', () => {
    const { context, messages } = makeContextWithExpertMessage()
    handleToolCalling(
      {
        id: 'e1', type: 'tool.calling' as const, timestamp: '',
        data: { task_id: 'task-1', expert_type: 'search', tool: 'asearch_web', source: 'builtin' as const, args_summary: '', attempt: 1 },
      } as never,
      context
    )
    handleToolCalling(
      {
        id: 'e2', type: 'tool.calling' as const, timestamp: '',
        data: { task_id: 'task-1', expert_type: 'search', tool: 'asearch_web', source: 'builtin' as const, args_summary: '', attempt: 2 },
      } as never,
      context
    )
    handleToolResult(
      {
        id: 'e3', type: 'tool.result' as const, timestamp: '',
        data: { task_id: 'task-1', expert_type: 'search', tool: 'asearch_web', source: 'builtin' as const, success: false, duration_ms: 2210 },
      } as never,
      context
    )

    // 只转最后一个 calling；前一个保持 calling（各自轮次独立）
    expect(messages[0].metadata?.toolCalls).toEqual([
      { tool: 'asearch_web', source: 'builtin', status: 'calling' },
      { tool: 'asearch_web', source: 'builtin', duration_ms: 2210, success: false, status: 'done' },
    ])
  })

  it('迟到的不相关工具 result 不污染序列（新增完成项兜底，不动 calling）', () => {
    const { context, messages } = makeContextWithExpertMessage()
    handleToolCalling(
      {
        id: 'e1', type: 'tool.calling' as const, timestamp: '',
        data: { task_id: 'task-1', expert_type: 'search', tool: 'maps_geo', source: 'mcp' as const, args_summary: '', attempt: 2 },
      } as never,
      context
    )
    handleToolResult(
      {
        id: 'e2', type: 'tool.result' as const, timestamp: '',
        data: { task_id: 'task-1', expert_type: 'search', tool: 'asearch_web', source: 'builtin' as const, success: true, duration_ms: 100 },
      } as never,
      context
    )

    const calls = messages[0].metadata?.toolCalls ?? []
    expect(calls[0]).toMatchObject({ tool: 'maps_geo', status: 'calling' })
    // 无匹配 calling 的迟到 result 作为完成项落入序列（不覆盖）
    expect(calls[1]).toMatchObject({ tool: 'asearch_web', status: 'done', success: true })
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
