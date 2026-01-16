import { create } from 'zustand'
import { getUserProfile, updateUserProfile, type UserProfile } from '@/services/api'

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
      console.error("Failed to fetch user:", error)
      set({ error: (error as Error).message, isLoading: false })
    }
  },

  updateUser: async (data) => {
    set({ isLoading: true, error: null })
    try {
      const updatedUser = await updateUserProfile(data)
      set({ user: updatedUser, isLoading: false })
    } catch (error) {
       console.error("Failed to update user:", error)
      set({ error: (error as Error).message, isLoading: false })
    }
  }
}))
