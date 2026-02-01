/**
 * Zustand 持久化中间件
 * 将状态持久化到 localStorage，支持页面刷新后恢复
 */

import type { StateCreator, StoreMutatorIdentifier } from 'zustand'

// 持久化配置选项
interface PersistOptions<T> {
  /** localStorage 的 key */
  name: string
  /** 需要持久化的字段（默认全部） */
  partialize?: (state: T) => Partial<T>
  /** 版本号（用于数据迁移） */
  version?: number
  /** 自定义序列化 */
  serialize?: (state: Partial<T>) => string
  /** 自定义反序列化 */
  deserialize?: (str: string) => Partial<T>
  /** 是否启用（默认 true） */
  enabled?: boolean
}

type Persist = <
  T,
  Mps extends [StoreMutatorIdentifier, unknown][] = [],
  Mcs extends [StoreMutatorIdentifier, unknown][] = []
>(
  initializer: StateCreator<T, Mps, Mcs>,
  options: PersistOptions<T>
) => StateCreator<T, Mps, Mcs>

/**
 * 持久化中间件
 * 
 * 用法：
 * ```ts
 * const useStore = create<MyState>()(
 *   persist(
 *     (set, get) => ({ ... }),
 *     { name: 'my-store' }
 *   )
 * )
 * ```
 */
export const persist: Persist = (initializer, options) => {
  return (set, get, api) => {
    const {
      name,
      partialize = (state) => state,
      version = 0,
      serialize = JSON.stringify,
      deserialize = JSON.parse,
      enabled = true
    } = options

    // 如果不启用，直接返回原始 initializer
    if (!enabled) {
      return initializer(set, get, api)
    }

    // 尝试从 localStorage 恢复状态
    const storageKey = `${name}@${version}`
    let restoredState: Partial<typeof initializer> | undefined

    try {
      const stored = localStorage.getItem(storageKey)
      if (stored) {
        restoredState = deserialize(stored)
        console.log(`[Persist] 恢复状态: ${name}`)
      }
    } catch (e) {
      console.warn(`[Persist] 恢复状态失败: ${name}`, e)
    }

    // 创建包装后的 set 函数
    const setWithPersist: typeof set = (partial, replace) => {
      // 先执行原始 set
      set(partial, replace)

      // 然后持久化到 localStorage
      try {
        const state = get()
        const toPersist = partialize(state)
        localStorage.setItem(storageKey, serialize(toPersist))
      } catch (e) {
        console.warn(`[Persist] 保存状态失败: ${name}`, e)
      }
    }

    // 初始化 store
    const store = initializer(setWithPersist, get, api)

    // 如果有恢复的状态，合并到初始状态
    if (restoredState) {
      // 使用 setTimeout 确保在下一个 tick 合并状态
      // 这样可以避免在初始化时触发订阅者
      setTimeout(() => {
        setWithPersist(restoredState as any)
      }, 0)
    }

    // 添加清除方法
    ;(api as any).clearPersist = () => {
      try {
        localStorage.removeItem(storageKey)
        console.log(`[Persist] 清除状态: ${name}`)
      } catch (e) {
        console.warn(`[Persist] 清除状态失败: ${name}`, e)
      }
    }

    return store
  }
}

/**
 * 清除所有持久化状态
 */
export function clearAllPersistedStates(prefix = '') {
  try {
    const keys = Object.keys(localStorage)
    keys.forEach((key) => {
      if (key.includes('@') && (prefix === '' || key.startsWith(prefix))) {
        localStorage.removeItem(key)
      }
    })
    console.log('[Persist] 清除所有状态')
  } catch (e) {
    console.warn('[Persist] 清除所有状态失败', e)
  }
}

/**
 * 获取持久化状态（用于调试）
 */
export function getPersistedState<T>(name: string, version = 0): T | null {
  try {
    const stored = localStorage.getItem(`${name}@${version}`)
    if (stored) {
      return JSON.parse(stored) as T
    }
  } catch (e) {
    console.warn(`[Persist] 获取状态失败: ${name}`, e)
  }
  return null
}
