import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleToolCalling, handleToolResult } from '../toolEvents'
import type { HandlerContext } from '../types'
import type { ThinkingStep } from '@/types'

// Mock logger
vi.mock('@/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn()
  }
}))

/** 构造一条带 thinking 步骤的助手消息（handlers 经 getLastAssistantMessage 读取；
 * store 的 Message 是扁平结构：metadata 直接挂在消息上。
 * updateMessageMetadata 需要真正落状态——乱序防护等用例依赖跨调用可见性） */
function makeContextWithSteps(steps: Partial<ThinkingStep>[]): HandlerContext {
  const message = {
    id: 'msg-1',
    role: 'assistant',
    metadata: {
      thinking: steps.map((s, i) => ({
        id: s.id ?? `step-${i}`,
        expertType: s.expertType ?? 'search',
        expertName: s.expertName ?? 'search',
        content: s.content ?? '',
        timestamp: s.timestamp ?? '2026-09-23T00:00:00Z',
        status: s.status ?? 'running',
        type: s.type ?? 'execution',
        ...s
      })) as ThinkingStep[]
    }
  }
  const messages = [message]
  return {
    taskStore: {} as any,
    chatStore: {
      messages,
      updateMessageMetadata: vi.fn((id: string, meta: Record<string, unknown>) => {
        const msg = messages.find((m) => m.id === id)
        if (msg) Object.assign(msg.metadata, meta)
      }),
      lastAssistantMessageId: null
    } as any,
    debug: false
  }
}

function readSteps(context: HandlerContext): ThinkingStep[] {
  const calls = (context.chatStore.updateMessageMetadata as ReturnType<typeof vi.fn>).mock.calls
  const last = calls[calls.length - 1]
  return last[1].thinking as ThinkingStep[]
}

describe('Tool Events', () => {
  let baseSteps: Partial<ThinkingStep>[]

  beforeEach(() => {
    baseSteps = [{ id: 'task-1', status: 'running', type: 'execution' }]
  })

  it('tool.calling 更新对应步骤的 toolActivity 为 calling 态', () => {
    const ctx = makeContextWithSteps(baseSteps)
    handleToolCalling(
      {
        id: 'e1',
        type: 'tool.calling',
        timestamp: '2026-09-23T00:00:00Z',
        data: {
          task_id: 'task-1',
          expert_type: 'search',
          tool: 'asearch_web',
          source: 'builtin',
          args_summary: "{'q': 'rust'}",
          attempt: 1
        }
      } as any,
      ctx
    )

    const steps = readSteps(ctx)
    expect(steps[0].toolActivity).toEqual({
      tool: 'asearch_web',
      source: 'builtin',
      state: 'calling',
      attempt: 1
    })
  })

  it('tool.result 覆盖同工具的 calling 态并带耗时成败', () => {
    const ctx = makeContextWithSteps(baseSteps)
    const events = {
      id: 'e2',
      type: 'tool.result' as const,
      timestamp: '2026-09-23T00:00:00Z',
      data: {
        task_id: 'task-1',
        expert_type: 'search',
        tool: 'asearch_web',
        source: 'builtin',
        success: true,
        duration_ms: 2210
      }
    }
    handleToolCalling({ ...events, type: 'tool.calling', data: { ...events.data, attempt: 1, args_summary: '' } } as any, ctx)
    handleToolResult(events as any, ctx)

    const steps = readSteps(ctx)
    expect(steps[0].toolActivity).toEqual({
      tool: 'asearch_web',
      source: 'builtin',
      state: 'done',
      durationMs: 2210,
      success: true
    })
    // 终态明细入 toolHistory（完成后保留的执行记录）
    expect(steps[0].toolHistory).toEqual([
      { tool: 'asearch_web', source: 'builtin', durationMs: 2210, success: true }
    ])
  })

  it('多次调用累计到 toolHistory（汇总行的数据源）', () => {
    const ctx = makeContextWithSteps(baseSteps)
    for (const [tool, ms] of [['asearch_web', 1000], ['read_webpage', 2500]] as const) {
      handleToolCalling(
        {
          id: 'e', type: 'tool.calling' as const, timestamp: '',
          data: { task_id: 'task-1', expert_type: 'search', tool, source: 'builtin' as const, args_summary: '', attempt: 1 }
        } as any,
        ctx
      )
      handleToolResult(
        {
          id: 'e', type: 'tool.result' as const, timestamp: '',
          data: { task_id: 'task-1', expert_type: 'search', tool, source: 'builtin' as const, success: true, duration_ms: ms }
        } as any,
        ctx
      )
    }
    const steps = readSteps(ctx)
    expect(steps[0].toolHistory).toHaveLength(2)
    expect(steps[0].toolHistory?.[1]).toEqual({
      tool: 'read_webpage', source: 'builtin', durationMs: 2500, success: true
    })
  })

  it('迟到的不相关工具 result 不覆盖当前 calling（乱序防护）', () => {
    const ctx = makeContextWithSteps(baseSteps)
    handleToolCalling(
      {
        id: 'e3',
        type: 'tool.calling',
        timestamp: '',
        data: {
          task_id: 'task-1',
          expert_type: 'search',
          tool: 'maps_geo',
          source: 'mcp',
          args_summary: '',
          attempt: 2
        }
      } as any,
      ctx
    )
    handleToolResult(
      {
        id: 'e4',
        type: 'tool.result',
        timestamp: '',
        data: {
          task_id: 'task-1',
          expert_type: 'search',
          tool: 'asearch_web',
          source: 'builtin',
          success: true,
          duration_ms: 100
        }
      } as any,
      ctx
    )

    // 仍是 maps_geo 的 calling 态（attempt=2），未被旧工具的 result 覆盖
    const steps = readSteps(ctx)
    expect(steps[0].toolActivity).toMatchObject({ tool: 'maps_geo', state: 'calling', attempt: 2 })
  })

  it('task_id 不匹配时不更新任何步骤', () => {
    const ctx = makeContextWithSteps(baseSteps)
    handleToolCalling(
      {
        id: 'e5',
        type: 'tool.calling',
        timestamp: '',
        data: {
          task_id: 'task-other',
          expert_type: 'search',
          tool: 'asearch_web',
          source: 'builtin',
          args_summary: '',
          attempt: 1
        }
      } as any,
      ctx
    )

    expect((ctx.chatStore.updateMessageMetadata as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0)
  })
})
