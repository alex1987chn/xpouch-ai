import { create } from 'zustand'

interface LoadingState {
  // 所有加载状态的映射，key为状态标识
  loadingStates: Record<string, {
    isLoading: boolean
    message?: string
    metadata?: Record<string, any>
  }>
  
  // 设置特定key的加载状态
  setLoading: (key: string, isLoading: boolean, message?: string, metadata?: Record<string, any>) => void
  
  // 清除特定key的加载状态
  clearLoading: (key: string) => void
  
  // 清除所有加载状态
  clearAllLoading: () => void
  
  // 获取特定key的加载状态
  getLoadingState: (key: string) => { isLoading: boolean; message?: string; metadata?: Record<string, any> } | undefined
  
  // 派生状态：是否有任何加载状态为true
  isLoading: boolean
  
  // 派生状态：当前活动的加载消息（取第一个活动的状态）
  loadingMessage?: string
}

export const useLoadingStore = create<LoadingState>((set, get) => ({
  loadingStates: {},
  
  setLoading: (key, isLoading, message, metadata) => set((state) => ({
    loadingStates: {
      ...state.loadingStates,
      [key]: {
        isLoading,
        message: isLoading ? message : undefined,
        metadata: isLoading ? metadata : undefined
      }
    }
  })),
  
  clearLoading: (key) => set((state) => {
    const newLoadingStates = { ...state.loadingStates }
    delete newLoadingStates[key]
    return { loadingStates: newLoadingStates }
  }),
  
  clearAllLoading: () => set({ loadingStates: {} }),
  
  getLoadingState: (key) => {
    return get().loadingStates[key]
  },
  
  get isLoading() {
    return Object.values(get().loadingStates).some(state => state.isLoading)
  },
  
  get loadingMessage() {
    const activeState = Object.values(get().loadingStates).find(state => state.isLoading)
    return activeState?.message
  }
}))
