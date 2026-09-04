/**
 * 带自动恢复的懒加载：动态 import 失败（构建哈希失效/发版后旧 chunk 404）时
 * 自动整页刷新一次拿新构建，而不是把用户扔进错误页。
 *
 * 场景：页面开着时服务端发布了新构建——旧 JS 引用的旧哈希 chunk 已不存在，
 * 点击未访问过的懒加载路由即报 "Failed to fetch dynamically imported module"。
 * sessionStorage 守卫防止刷新后仍失败造成死循环（此时退回原始错误）。
 */

import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

const RELOADED_KEY = 'xpouch:chunk-reloaded'

function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return (
    message.includes('Failed to fetch dynamically imported module') ||
    message.includes('Importing a module script failed') ||
    message.includes('error loading dynamically imported module')
  )
}

// 签名对齐 React.lazy，保留组件 props 类型推断
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWithReload<T extends ComponentType<any>>(
  load: () => Promise<{ default: T }>
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      return await load()
    } catch (error) {
      if (isChunkLoadError(error) && !sessionStorage.getItem(RELOADED_KEY)) {
        sessionStorage.setItem(RELOADED_KEY, '1')
        window.location.reload()
        // reload 期间返回一个永不 resolve 的 promise，避免渲染错误态闪烁
        return await new Promise<never>(() => {})
      }
      throw error
    }
  })
}
