import { create } from 'zustand'
import { getUserProfile, updateUserProfile, type UserProfile } from '@/services/api'
import { logger, errorHandler } from '@/utils/logger'

interface UserState {
  user: UserProfile | null
  isLoading: boolean
  error: string | null

  fetchUser: () => Promise<void>
  updateUser: (data: Partial<UserProfile>) => Promise<void>
}

export const useUserStore = create<UserState>((set) => ({
  user: null,
  isLoading: false,
  error: null,

  fetchUser: async () => {
    set({ isLoading: true, error: null })
    try {
      const user = await getUserProfile()
      set({ user, isLoading: false })
    } catch (error) {
      errorHandler.handleSync(error, 'fetchUser')
      set({ error: errorHandler.getUserMessage(error), isLoading: false })
    }
  },

  updateUser: async (data) => {
    set({ isLoading: true, error: null })
    try {
      const updatedUser = await updateUserProfile(data)
      set({ user: updatedUser, isLoading: false })
    } catch (error) {
      errorHandler.handleSync(error, 'updateUser')
      set({ error: errorHandler.getUserMessage(error), isLoading: false })
    }
  }
}))
