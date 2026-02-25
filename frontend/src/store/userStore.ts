import { create } from 'zustand'
// P0 修复: 移除 persist，Token 改为 HttpOnly Cookie
import { getUserProfile, updateUserProfile, type UserProfile } from '@/services/user'
import { sendVerificationCode, verifyCodeAndLogin, logoutApi, type LoginResponse } from '@/services/auth'
import { logger, errorHandler } from '@/utils/logger'

interface UserState {
  user: UserProfile | null
  isLoading: boolean
  error: string | null
  isAuthenticated: boolean

  // Auth methods
  loginWithPhone: (phoneNumber: string, code: string) => Promise<void>
  sendVerificationCode: (phoneNumber: string) => Promise<void>
  logout: () => Promise<void>
  checkAuth: () => Promise<boolean>

  // User methods
  fetchUser: () => Promise<void>
  updateUser: (data: Partial<UserProfile>) => Promise<void>
}

export const useUserStore = create<UserState>()(
  (set, get) => ({
    // Initial state
    user: null,
    isLoading: false,
    error: null,
    isAuthenticated: false,

    // Auth: Send verification code
    sendVerificationCode: async (phoneNumber: string) => {
      set({ isLoading: true, error: null })
      try {
        const data = await sendVerificationCode(phoneNumber)
        set({ isLoading: false })
        return data
      } catch (error) {
        errorHandler.handleSync(error, 'sendVerificationCode')
        set({ error: errorHandler.getUserMessage(error), isLoading: false })
        throw error
      }
    },

    // Auth: Login with phone verification code
    loginWithPhone: async (phoneNumber: string, code: string) => {
      set({ isLoading: true, error: null })
      try {
        // P0 修复: 登录接口现在只返回用户信息，Token 在 Cookie 中
        const data: LoginResponse = await verifyCodeAndLogin(phoneNumber, code)

        // 获取用户信息
        try {
          const user = await getUserProfile()
          set({
            user,
            isAuthenticated: true,
            isLoading: false
          })
        } catch (profileError) {
          errorHandler.handleSync(profileError, 'getUserProfile')
          throw profileError
        }
      } catch (error) {
        errorHandler.handleSync(error, 'loginWithPhone')
        set({ error: errorHandler.getUserMessage(error), isLoading: false, isAuthenticated: false })
        throw error
      }
    },

    // P0 修复: 检查认证状态（通过调用 /api/auth/me）
    checkAuth: async () => {
      try {
        const user = await getUserProfile()
        set({ user, isAuthenticated: true })
        return true
      } catch (error) {
        // 401 或其他错误表示未认证
        set({ user: null, isAuthenticated: false })
        return false
      }
    },

    // Auth: Logout
    logout: async () => {
      try {
        // P0 修复: 调用后端登出接口清除 Cookie
        await logoutApi()
      } catch (error) {
        logger.warn('Logout API call failed:', error)
        // 即使 API 失败，也清除本地状态
      }
      
      set({
        user: null,
        isAuthenticated: false,
        error: null
      })
    },

    // User: Fetch user profile
    fetchUser: async () => {
      set({ isLoading: true, error: null })
      try {
        const remoteUser = await getUserProfile()
        const localUser = get().user
        
        // 比较更新时间戳，只有当远程数据更新时才更新本地状态
        if (localUser && remoteUser.updated_at) {
          // 如果远程更新时间晚于本地更新时间，更新本地状态
          if (remoteUser.updated_at > localUser.updated_at) {
            set({ user: remoteUser, isLoading: false })
          } else {
            // 远程数据不比本地新，保持现有状态（避免不必要的重渲染）
            set({ isLoading: false })
          }
        } else {
          // 本地没有用户数据或远程数据缺少时间戳，直接设置
          set({ user: remoteUser, isLoading: false })
        }
      } catch (error) {
        errorHandler.handleSync(error, 'fetchUser')
        set({ error: errorHandler.getUserMessage(error), isLoading: false })
        // If user fetch fails (e.g., 401), logout
        if ((error as any)?.status === 401) {
          set({ user: null, isAuthenticated: false })
        }
      }
    },

    // User: Update user profile
    updateUser: async (data) => {
      set({ isLoading: true, error: null })
      try {
        const updatedUser = await updateUserProfile(data)
        set({ user: updatedUser, isLoading: false })
      } catch (error) {
        errorHandler.handleSync(error, 'updateUser')
        set({ error: errorHandler.getUserMessage(error), isLoading: false })
        throw error
      }
    }
  })
)

// Selector helpers
export const selectIsAuthenticated = (state: UserState) => state.isAuthenticated
export const selectUser = (state: UserState) => state.user
