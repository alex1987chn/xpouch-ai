/**
 * SSE 传输层：fetch + eventsource-parser（2026-09-26 迁移自 @microsoft/fetch-event-source）。
 *
 * [为什么迁移] 原库（Azure/fetch-event-source）维护冻结多年，规范缺口不会
 * 再修；eventsource-parser 是现役标准（Vercel AI SDK 生态的底层件）。
 *
 * [架构分工] 本模块只做「传输 + 线格式解析」——fetch 建立 POST/GET SSE
 * 连接、ReadableStream 逐块喂给 eventsource-parser；重连/断点续传/会话
 * 归属守卫等策略全部留在调用方（chat.ts 自持的 stream_hub + seq 体系，
 * 见 docs/DECISIONS.md「合理自研」条目）。
 *
 * [与原库的行为差异——刻意为之，不留等价层]
 * - **无自动重试**：原库 onerror 返回后会静默重开连接（POST 重发！），调用方
 *   只能靠 throw FatalSSEError 阻止；本实现结构上不存在重发，onerror 只需
 *   结算一次。POST+SSE 非幂等，这是唯一正确语义
 * - **无页面可见性感知**：原库默认藏页断连（openWhenHidden: true 绕过）；
 *   原生 fetch 天然无此行为
 * - HTTP 非 2xx 走 onopen（与原契约一致：!ok 由调用方处理并抛错终止）
 * - 服务端正常关流 → onclose；abort/网络错误 → onerror
 */

import { createParser, type EventSourceMessage } from 'eventsource-parser'

export type { EventSourceMessage }

export interface FetchSSEOptions {
  method?: 'GET' | 'POST'
  headers?: Record<string, string>
  body?: string
  signal?: AbortSignal
  /** 连接建立后调用（含非 2xx——调用方在此解析错误体并抛错以终止） */
  onopen?: (response: Response) => Promise<void> | void
  /** 每条解析出的 SSE 消息 */
  onmessage: (msg: EventSourceMessage) => void
  /** abort 或网络错误（读流失败）。无重试：结算即终态 */
  onerror?: (err: unknown) => void
  /** 服务端正常关闭流 */
  onclose?: () => void
}

/**
 * 发起 SSE 请求并消费至流结束。
 *
 * 错误传播：onopen 抛出的异常向调用方 promise 冒泡（调用方 catch 结算）；
 * onerror/onclose 内的异常同样冒泡——与原 fetch-event-source 契约一致，
 * 结算责任在调用方（safeReject 单次结算模式）。
 */
export async function fetchSSE(url: string, options: FetchSSEOptions): Promise<void> {
  const { method = 'GET', headers, body, signal, onopen, onmessage, onerror, onclose } = options

  const response = await fetch(url, { method, headers, body, signal })
  if (onopen) await onopen(response)
  if (!response.ok || !response.body) {
    // !ok 且 onopen 未抛：调用方已在 onopen 结算，静默收尾
    return
  }

  const parser = createParser({
    onEvent: (msg) => onmessage(msg),
  })
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) {
        onclose?.()
        return
      }
      parser.feed(decoder.decode(value, { stream: true }))
    }
  } catch (err) {
    onerror?.(err)
  }
}
