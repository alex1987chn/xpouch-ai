import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { getUserProfile, updateUserProfile, type UserProfile } from '@/services/api'
import { logger, errorHandler } from '@/utils/logger'

interface AuthTokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
  user_id: string
  username: string
}

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
  refreshToken: () => Promise<void>
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
        console.log('[userStore] sendVerificationCode 开始，手机号:', phoneNumber)
        set({ isLoading: true, error: null })
        try {
          // 使用相对路径，通过 Vite 代理转发到后端
          const apiUrl = '/api/auth/send-code'
          console.log('[userStore] 请求 URL:', apiUrl)
          console.log('[userStore] 环境变量 VITE_API_BASE_URL:', import.meta.env.VITE_API_BASE_URL)
          console.log('[userStore] Vite 模式:', import.meta.env.MODE)
          console.log('[userStore] 是否为开发环境:', import.meta.env.DEV)

          const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone_number: phoneNumber })
          })

          console.log('[userStore] 响应状态:', response.status, response.statusText)

          const data = await response.json()
          console.log('[userStore] 响应数据:', data)

          if (!response.ok) {
            throw new Error(data.detail || '发送验证码失败')
          }
          set({ isLoading: false })
          // 开发环境返回验证码用于测试
          if (data._debug_code) {
            logger.debug(`[Auth] 验证码: ${data._debug_code}`)
          }
          console.log('[userStore] sendVerificationCode 成功')
          return data as any // 返回完整响应数据
        } catch (error) {
          console.error('[userStore] sendVerificationCode 错误:', error)
          console.error('[userStore] 错误详情:', {
            name: error.name,
            message: error.message,
            stack: error.stack
          })
          errorHandler.handleSync(error, 'sendVerificationCode')
          set({ error: errorHandler.getUserMessage(error), isLoading: false })
          throw error
        }
      },

      // Auth: Login with phone verification code
      loginWithPhone: async (phoneNumber: string, code: string) => {
        console.log('[userStore] loginWithPhone 开始，手机号:', phoneNumber, '验证码:', code)
        set({ isLoading: true, error: null })
        try {
          // 使用相对路径，通过 Vite 代理转发到后端
          const response = await fetch('/api/auth/verify-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone_number: phoneNumber, code })
          })

          console.log('[userStore] 验证响应状态:', response.status, response.statusText)

          const data: AuthTokenResponse = await response.json()
          console.log('[userStore] 验证响应数据:', data)

          if (!response.ok) {
            throw new Error(data.detail || '验证失败')
          }

          // Calculate token expiry
          const expiresAt = Date.now() + data.expires_in * 1000

          // 先保存 token
          set({
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            tokenExpiresAt: expiresAt
          })

          console.log('[userStore] Token已保存，开始获取用户信息')

          // 获取用户信息后再设置 isAuthenticated
          try {
            const user = await getUserProfile()
            set({
              user,
              isAuthenticated: true,
              isLoading: false
            })
            console.log('[userStore] 用户信息获取成功，登录完成')
          } catch (userError) {
            console.error('[userStore] 获取用户信息失败:', userError)
            // 即使获取用户信息失败，也算登录成功
            set({
              user: {
                id: data.user_id,
                username: data.username,
                plan: 'Free'
              },
              isAuthenticated: true,
              isLoading: false
            })
          }
        } catch (error) {
          console.error('[userStore] loginWithPhone 错误:', error)
          errorHandler.handleSync(error, 'loginWithPhone')
          set({ error: errorHandler.getUserMessage(error), isLoading: false, isAuthenticated: false })
          throw error
        }
      },

      // Auth: Refresh access token
      refreshToken: async () => {
        const { refreshToken: currentRefreshToken } = get()
        if (!currentRefreshToken) {
          throw new Error('No refresh token available')
        }

        try {
          // 使用相对路径，通过 Vite 代理转发到后端
          const response = await fetch('/api/auth/refresh-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: currentRefreshToken })
          })
          const data: AuthTokenResponse = await response.json()
          if (!response.ok) {
            throw new Error(data.detail || '刷新token失败')
          }

          const expiresAt = Date.now() + data.expires_in * 1000

          set({
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            tokenExpiresAt: expiresAt,
            isAuthenticated: true
          })
        } catch (error) {
          // Refresh failed, logout user
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
          const user = await getUserProfile()
          set({ user, isLoading: false })
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

