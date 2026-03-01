/**
 * AuthStore 性能优化 Selectors
 * 
 * 使用 Zustand Selector 模式避免不必要的重渲染
 */

import { useShallow } from 'zustand/react/shallow'
import { useUserStore } from '@/store/userStore'

// ============================================================================
// 基础 Selectors (返回原始值)
// ============================================================================

/** 获取认证状态 */
export const useIsAuthenticated = () => 
  useUserStore(state => state.isAuthenticated)

/** 获取用户信息 */
export const useUser = () => useUserStore(useShallow(state => state.user))

/** 获取加载状态 */
export const useIsAuthLoading = () => 
  useUserStore(state => state.isLoading)

// ============================================================================
// 复杂 Selectors (使用 useShallow)
// ============================================================================

/**
 * 获取认证相关状态（整体获取）
 */
export const useAuth = () => useUserStore(
  useShallow(state => ({
    isAuthenticated: state.isAuthenticated,
    user: state.user,
    isLoading: state.isLoading,
  }))
)


