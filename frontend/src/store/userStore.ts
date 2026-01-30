import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { getUserProfile, updateUserProfile, type UserProfile } from '@/services/user'
import { sendVerificationCode, verifyCodeAndLogin, refreshTokenApi, type TokenResponse } from '@/services/auth'
import { logger, errorHandler } from '@/utils/logger'

interface UserState {
  user: UserProfile | null
  isLoading: boolean
  error: string | null
  isAuthenticated: boolean
  accessToken: string | null
  refreshToken: string | null
  tokenExpiresAt: number | null

  // Auth methods
  loginWithPhone: (phoneNumber: string, code: string) => Promise<void>
  sendVerificationCode: (phoneNumber: string) => Promise<void>
  refreshAccessToken: () => Promise<void>
  logout: () => void
  checkTokenExpiry: () => boolean

  // User methods
  fetchUser: () => Promise<void>
  updateUser: (data: Partial<UserProfile>) => Promise<void>
}

const ACCESS_TOKEN_KEY = 'xpouch_access_token'
const REFRESH_TOKEN_KEY = 'xpouch_refresh_token'
const TOKEN_EXPIRES_AT_KEY = 'xpouch_token_expires_at'

export const useUserStore = create<UserState>()(
  persist(
    (set, get) => ({
      // Initial state
      user: null,
      isLoading: false,
      error: null,
      isAuthenticated: false,
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: null,

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
          const data = await verifyCodeAndLogin(phoneNumber, code)

          // Calculate token expiry
          const expiresAt = Date.now() + data.expires_in * 1000

          // 先清空旧的 user 数据，然后保存 token
          set({
            user: null,
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            tokenExpiresAt: expiresAt
          })

          // 获取用户信息后再设置 isAuthenticated
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

      // Auth: Refresh access token
      refreshAccessToken: async () => {
        const { refreshToken: currentRefreshToken } = get()
        if (!currentRefreshToken) {
          throw new Error('No refresh token available')
        }

        try {
          const data = await refreshTokenApi(currentRefreshToken)
          const expiresAt = Date.now() + data.expires_in * 1000

          set({
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            tokenExpiresAt: expiresAt,
            isAuthenticated: true
          })
        } catch (error) {
          get().logout()
          throw error
        }
      },

      // Auth: Check if token is expired
      checkTokenExpiry: () => {
        const { tokenExpiresAt } = get()
        if (!tokenExpiresAt) return true // No expiry time means token is invalid
        return Date.now() >= tokenExpiresAt
      },

      // Auth: Logout
      logout: () => {
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          tokenExpiresAt: null,
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
            get().logout()
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
    }),
    {
      name: 'xpouch-user-storage',
      version: 1,
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          errorHandler.handleSync(error, 'onRehydrateStorage')
          return
        }

        // 数据恢复成功后，如果有有效的 accessToken，自动获取最新用户信息
        if (state?.accessToken && state?.isAuthenticated) {
          // 延迟执行，确保 store 完全初始化
          setTimeout(() => {
            if (state?.fetchUser) {
              state.fetchUser().catch(() => {
                // 如果获取失败（如 token 过期），会自动登出
              })
            }
          }, 100)
        }
      },
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        tokenExpiresAt: state.tokenExpiresAt,
        isAuthenticated: state.isAuthenticated,
        user: state.user
      })
    }
  )
)

// Selector helpers
export const selectIsAuthenticated = (state: UserState) => state.isAuthenticated
export const selectAccessToken = (state: UserState) => state.accessToken

