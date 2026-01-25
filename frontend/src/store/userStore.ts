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

          // 先清空旧的 user 数据，然后保存 token
          set({
            user: null,  // ← 清空旧的用户数据
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            tokenExpiresAt: expiresAt
          })

          console.log('[userStore] Token已保存，旧用户数据已清空，开始获取用户信息')

          // 获取用户信息后再设置 isAuthenticated
          try {
            const user = await getUserProfile()
            console.log('[userStore] 从后端获取的用户信息:', user)
            console.log('[userStore] 用户名:', user.username)
            set({
              user,
              isAuthenticated: true,
              isLoading: false
            })
            console.log('[userStore] 用户信息获取成功，登录完成:', user)
          } catch (profileError) {
            console.error('[userStore] 获取用户信息失败:', profileError)
            throw profileError  // 重新抛出错误
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
          const remoteUser = await getUserProfile()
          const localUser = get().user
          
          // 比较更新时间戳，只有当远程数据更新时才更新本地状态
          if (localUser && remoteUser.updated_at) {
            // 如果远程更新时间晚于本地更新时间，更新本地状态
            if (remoteUser.updated_at > localUser.updated_at) {
              console.log('[userStore] 检测到用户信息已更新，更新本地缓存')
              console.log('[userStore] 本地更新时间:', localUser.updated_at)
              console.log('[userStore] 远程更新时间:', remoteUser.updated_at)
              set({ user: remoteUser, isLoading: false })
            } else {
              // 远程数据不比本地新，保持现有状态（避免不必要的重渲染）
              console.log('[userStore] 用户信息未更新，保持本地缓存')
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
        console.log('[userStore] updateUser 开始，数据:', data)
        set({ isLoading: true, error: null })
        try {
          const updatedUser = await updateUserProfile(data)
          console.log('[userStore] updateUser 成功，返回用户信息:', updatedUser)
          console.log('[userStore] 更新后的用户名:', updatedUser.username)
          set({ user: updatedUser, isLoading: false })
        } catch (error) {
          console.error('[userStore] updateUser 失败:', error)
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
          console.error('[userStore] 持久化数据恢复失败:', error)
          return
        }
        
        // 数据恢复成功后，如果有有效的 accessToken，自动获取最新用户信息
        if (state?.accessToken && state?.isAuthenticated) {
          console.log('[userStore] 持久化数据恢复成功，自动获取最新用户信息')
          // 延迟执行，确保 store 完全初始化
          setTimeout(() => {
            if (state?.fetchUser) {
              state.fetchUser().catch(err => {
                console.warn('[userStore] 自动获取用户信息失败:', err)
                // 如果获取失败（如 token 过期），会自动登出
              })
            }
          }, 100)
        } else {
          console.log('[userStore] 持久化数据恢复成功，用户未认证')
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

