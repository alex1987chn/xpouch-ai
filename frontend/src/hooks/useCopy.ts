/**
 * useCopy - 复制到剪贴板的统一 hook
 *
 * [背景] 此前 9 处组件各自手写 clipboard.writeText + copied 状态 + setTimeout
 * 复位，超时还有 1500/2000 两档不一致。收编后只有这一份实现。
 *
 * [降级] 非 https / 非 secure context 下 navigator.clipboard 不存在，
 * 回退到 textarea + execCommand（吸收自 MessageItem 此前唯一带兜底的实现）。
 */

import { useCallback, useEffect, useRef, useState } from 'react'

export function useCopy(resetMs = 1500) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<number | undefined>(undefined)

  const copy = useCallback(
    async (text: string): Promise<boolean> => {
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text)
        } else {
          const ta = document.createElement('textarea')
          ta.value = text
          ta.style.position = 'fixed'
          ta.style.opacity = '0'
          document.body.appendChild(ta)
          ta.select()
          document.execCommand('copy')
          document.body.removeChild(ta)
        }
        setCopied(true)
        window.clearTimeout(timerRef.current)
        timerRef.current = window.setTimeout(() => setCopied(false), resetMs)
        return true
      } catch {
        return false
      }
    },
    [resetMs],
  )

  useEffect(() => () => window.clearTimeout(timerRef.current), [])

  return { copied, copy }
}
