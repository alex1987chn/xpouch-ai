import { create } from 'zustand'
import type { TaskNode } from '@/types'

// 专家结果类型
export interface ExpertResult {
  expertType: string
  expertName: string
  description: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  output?: string
  artifact?: {
    type: 'code' | 'markdown' | 'search' | 'html' | 'text'
    content: string
    language?: string
  }
  duration?: number
  error?: string
  startedAt?: string
  completedAt?: string
}

interface CanvasState {
  tasks: TaskNode[]
  addTask: (task: TaskNode) => void
  updateTask: (id: string, updates: Partial<TaskNode>) => void
  updateAllTasks: (tasks: TaskNode[]) => void
  clearTasks: () => void

  // 魔法修改状态
  magicColor: string | null
  setMagicColor: (color: string) => void

  // 缩放和平移状态
  scale: number
  setScale: (scale: number) => void
  offsetX: number
  offsetY: number
  setOffset: (offsetX: number, offsetY: number) => void
  resetView: () => void

  // 拖动状态
  isDragging: boolean
  setIsDragging: (isDragging: boolean) => void

  // Artifact 状态管理
  artifactType: 'code' | 'markdown' | 'search' | 'html' | 'text' | null
  artifactContent: string
  setArtifact: (type: 'code' | 'markdown' | 'search' | 'html' | 'text' | null, content: string) => void
  clearArtifact: () => void

  // 专家结果状态管理
  expertResults: ExpertResult[]
  selectedExpert: string | null
  addExpertResult: (result: ExpertResult) => void
  updateExpertResult: (expertType: string, updates: Partial<ExpertResult>) => void
  selectExpert: (expertType: string | null) => void
  clearExpertResults: () => void
  retryExpert: (expertType: string) => void
}

export const useCanvasStore = create<CanvasState>((set) => ({
  tasks: [],
  addTask: (task) => set(state => ({ tasks: [...state.tasks, task] })),
  updateTask: (id, updates) => set(state => ({
    tasks: state.tasks.map(task =>
      task.id === id ? { ...task, ...updates } : task
    )
  })),
  updateAllTasks: (tasks) => set({ tasks }),
  clearTasks: () => set({ tasks: [] }),

  magicColor: null,
  setMagicColor: (color) => set({ magicColor: color }),

  // 缩放和平移
  scale: 1,
  setScale: (scale) => set({ scale }),
  offsetX: 0,
  offsetY: 0,
  setOffset: (offsetX, offsetY) => set({ offsetX, offsetY }),
  resetView: () => set({ scale: 1, offsetX: 0, offsetY: 0 }),

  // 拖动状态
  isDragging: false,
  setIsDragging: (isDragging) => set({ isDragging }),

  // Artifact 状态管理
  artifactType: null,
  artifactContent: '',
  setArtifact: (type, content) => {
    console.log('[canvasStore] setArtifact called:', { type, contentLength: content?.length || 0 })
    console.log('[canvasStore] content preview:', content?.substring(0, 100))
    set({ artifactType: type, artifactContent: content })
  },
  clearArtifact: () => {
    console.log('[canvasStore] clearArtifact called')
    set({ artifactType: null, artifactContent: '' })
  },

  // 专家结果状态管理
  expertResults: [],
  selectedExpert: null,
  addExpertResult: (result) => set(state => {
    console.log('[canvasStore] addExpertResult:', result)
    return { expertResults: [...state.expertResults, result] }
  }),
  updateExpertResult: (expertType, updates) => set(state => ({
    expertResults: state.expertResults.map(expert =>
      expert.expertType === expertType ? { ...expert, ...updates } : expert
    )
  })),
  selectExpert: (expertType) => {
    console.log('[canvasStore] selectExpert:', expertType)
    set({ selectedExpert: expertType })
  },
  clearExpertResults: () => set({ expertResults: [], selectedExpert: null }),
  retryExpert: (expertType) => {
    console.log('[canvasStore] retryExpert:', expertType)
    // TODO: 实现重试逻辑
    set(state => ({
      expertResults: state.expertResults.map(expert =>
        expert.expertType === expertType ? { ...expert, status: 'pending', error: undefined } : expert
      )
    }))
  }
}))
