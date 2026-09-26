/**
 * SSE 传输层（services/sse.ts）的线格式级集成测试。
 *
 * 用真实 fetchSSE + 真实 eventsource-parser，对模拟字节流跑规范边界：
 * 这层是 2026-09-26 从 @microsoft/fetch-event-source 迁移来的，迁移的
 * 全部风险都在"线格式解析 + 读流循环"——本文件直接钉住它们，而不是
 * 只测 mock（mock 测不出解析器选型的差异）。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchSSE } from '../sse'

/** 构造一个 Response 替身：body 为按给定字节块推送的 ReadableStream */
function sseResponse(chunks: Uint8Array[], init?: ResponseInit) {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    },
  })
  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
    ...init,
  })
}

function bytes(...parts: string[]): Uint8Array[] {
  const encoder = new TextEncoder()
  return parts.map((p) => encoder.encode(p))
}

let messages: { event?: string; data: string; id?: string }[]
let closed: boolean
let errors: unknown[]
let openedStatuses: number[]

beforeEach(() => {
  messages = []
  closed = false
  errors = []
  openedStatuses = []
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubFetch(chunks: Uint8Array[], init?: ResponseInit) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => sseResponse(chunks, init)),
  )
}

describe('fetchSSE 线格式解析', () => {
  it('基本事件 + 多行 data 拼接 + id 字段', async () => {
    stubFetch(
      bytes(
        'event: message.delta\n',
        'data: {"t":"你好"}\n\n',
        ': 注释行应被忽略\n\n',
        'id: 42\n',
        'data: 第一行\n',
        'data: 第二行\n\n',
      ),
    )
    await fetchSSE('http://x/sse', {
      onopen: (r) => openedStatuses.push(r.status),
      onmessage: (m) => messages.push(m),
      onclose: () => (closed = true),
      onerror: (e) => errors.push(e),
    })

    expect(openedStatuses).toEqual([200])
    expect(messages).toEqual([
      { event: 'message.delta', data: '{"t":"你好"}', id: undefined },
      { event: undefined, data: '第一行\n第二行', id: '42' },
    ])
    expect(closed).toBe(true)
    expect(errors).toEqual([])
  })

  it('CRLF 换行与跨块切断的字段名都能正确解析', async () => {
    // 行尾统一用规范的 \r\n；分块点故意切在字段名中间（ev|ent、da|ta）
    stubFetch(
      bytes(
        'ev',
        'ent: plan.created\r\n',
        'da',
        'ta: {"ok":true}\r\n',
        '\r\n',
      ),
    )
    await fetchSSE('http://x/sse', {
      onmessage: (m) => messages.push(m),
      onclose: () => (closed = true),
    })

    expect(messages).toEqual([{ event: 'plan.created', data: '{"ok":true}', id: undefined }])
    expect(closed).toBe(true)
  })

  it('UTF-8 多字节字符被网络分块切断在码点中间仍完整还原', async () => {
    // "青色" 的 UTF-8 字节为 9 字节（每个汉字 3 字节），从第 4 字节处切断
    const encoder = new TextEncoder()
    const full = encoder.encode('data: 青色测试\n\n')
    const cut = 4 + 3 // "data: " 6 字节 + 1 个完整汉字后切开
    stubFetch([full.slice(0, cut), full.slice(cut)])

    await fetchSSE('http://x/sse', {
      onmessage: (m) => messages.push(m),
      onclose: () => (closed = true),
    })

    expect(messages).toEqual([{ event: undefined, data: '青色测试', id: undefined }])
    expect(closed).toBe(true)
  })

  it('[DONE] 作为普通 data 消息送达（收口语义归调用方，与迁移前一致）', async () => {
    stubFetch(bytes('data: [DONE]\n\n'))
    await fetchSSE('http://x/sse', {
      onmessage: (m) => messages.push(m),
      onclose: () => (closed = true),
    })

    expect(messages).toEqual([{ event: undefined, data: '[DONE]', id: undefined }])
    expect(closed).toBe(true)
  })

  it('HTTP 非 2xx：onopen 拿到 response，抛错向调用方冒泡', async () => {
    stubFetch(bytes('{"error": 1}'), { status: 401 })
    const caught = await fetchSSE('http://x/sse', {
      onopen: (r) => {
        openedStatuses.push(r.status)
        throw new Error('auth failed')
      },
      onmessage: (m) => messages.push(m),
    }).catch((e: unknown) => e)

    expect(openedStatuses).toEqual([401])
    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).message).toBe('auth failed')
    expect(messages).toEqual([])
  })

  it('abort 触发 onerror（AbortError），onclose 不触发', async () => {
    const controller = new AbortController()
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode('data: 半截'))
        // 不 close：挂住读循环。真实 fetch 会把 abort 接到 body 流上
        // （read 以 AbortError 拒绝）——mock 里手工模拟这个接线
        controller.signal.addEventListener('abort', () => {
          c.error(new DOMException('Aborted', 'AbortError'))
        })
      },
    })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(stream, { status: 200 })))

    const promise = fetchSSE('http://x/sse', {
      signal: controller.signal,
      onmessage: (m) => messages.push(m),
      onerror: (e) => errors.push(e),
      onclose: () => (closed = true),
    })
    // 让读循环先拿到半截数据，再 abort
    await new Promise((r) => setTimeout(r, 10))
    controller.abort()
    await promise

    expect(errors.length).toBe(1)
    expect((errors[0] as Error).name).toBe('AbortError')
    expect(closed).toBe(false)
    // 半截无换行数据未成帧，不产生消息（规范行为）
    expect(messages).toEqual([])
  })
})
