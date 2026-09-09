import { useEffect, useRef } from 'react'

/**
 * 自研弹窗的无障碍增强（DESIGN.md §4.4 弹窗三件套的 a11y 补充）。
 *
 * - 打开时焦点进入弹窗（首个可聚焦元素），关闭时焦点归还触发元素
 * - Tab 焦点陷阱：焦点不会跑到弹窗底下的页面
 * - 返回容器 props：role="dialog" + aria-modal（可选 aria-labelledby）
 *
 * 用法：
 *   const a11y = useDialogA11y<HTMLDivElement>(open, 'my-dialog-title')
 *   <div ref={a11y.ref} role={a11y.role} aria-modal={a11y['aria-modal']} ...>
 *
 * Esc 关闭请继续使用 useEscapeToClose（职责分离）。
 */

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

export function useDialogA11y<T extends HTMLElement>(isOpen: boolean, labelledBy?: string) {
  const ref = useRef<T>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  // 打开：记录触发元素并把焦点移入弹窗；关闭：归还焦点
  useEffect(() => {
    if (!isOpen) return
    previouslyFocused.current = document.activeElement as HTMLElement | null
    const el = ref.current
    if (el) {
      const focusables = el.querySelectorAll<HTMLElement>(FOCUSABLE)
      const target = Array.from(focusables).find((n) => !n.hasAttribute('disabled'))
      ;(target ?? el).focus()
    }
    return () => {
      previouslyFocused.current?.focus?.()
    }
  }, [isOpen])

  // Tab 焦点陷阱
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const el = ref.current
      if (!el) return
      const focusables = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (n) => !n.hasAttribute('disabled') && n.offsetParent !== null
      )
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen])

  return {
    ref,
    role: 'dialog' as const,
    'aria-modal': true as const,
    tabIndex: -1 as const,
    ...(labelledBy ? { 'aria-labelledby': labelledBy } : {}),
  }
}
