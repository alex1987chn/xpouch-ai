/**
 * 全局 toast（模块级单例）。
 *
 * 为什么用 `useSyncExternalStore` 而不是自建 `useState` + 监听器集合：
 * - **不撕裂**：React 18 并发渲染下，外部可变数据必须经这个 API 读，否则一次渲染
 *   里可能读到两份快照（toast 是跨组件、跨事件处理器共享的状态，正好踩这个坑）。
 * - **少一套机制**：此前每个订阅者各写一份 `setToasts` 并注册/注销监听器，
 *   本质是在手写 useSyncExternalStore 的一个劣化版本。
 *
 * 对外 API 与之前完全一致（`pushToast` / `dismissToast` / `useToast`），
 * 因为调用方遍布事件处理器（SSE handler 等非 React 上下文）。
 */

import { useSyncExternalStore } from 'react'

export interface Toast {
  id: string
  title?: string
  description?: string
  variant?: 'default' | 'destructive'
}

/** toast 存活时长（毫秒） */
const TOAST_TTL_MS = 3000

/** 当前快照：只在变更时整体替换，保证 `useSyncExternalStore` 的引用稳定性要求 */
let toasts: Toast[] = []
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): Toast[] {
  return toasts
}

function emit(): void {
  for (const listener of listeners) listener()
}

function scheduleAutoDismiss(id: string): void {
  setTimeout(() => dismissToast(id), TOAST_TTL_MS)
}

export function dismissToast(id: string): void {
  const next = toasts.filter(t => t.id !== id)
  if (next.length === toasts.length) return
  toasts = next
  emit()
}

/** 递增序号：toast id 只用于列表 key，不需要随机性（也不该用 Math.random 招误报） */
let nextToastSeq = 0

/** 模块级推注入：供非 React 上下文（SSE 事件处理器等）直接弹 toast */
export function pushToast(props: Omit<Toast, 'id'>): void {
  const id = `toast-${(nextToastSeq += 1)}`
  toasts = [...toasts, { id, ...props }]
  emit()
  scheduleAutoDismiss(id)
}

export function useToast(): { toast: (props: Omit<Toast, 'id'>) => void; toasts: Toast[] } {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return { toast: pushToast, toasts: current }
}
