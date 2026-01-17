import { create } from 'zustand'
import type { TaskNode } from '@/types'

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
  artifactType: 'code' | 'mermaid' | 'markdown' | null
  artifactContent: string
  setArtifact: (type: 'code' | 'mermaid' | 'markdown' | null, content: string) => void
  clearArtifact: () => void
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
  setArtifact: (type, content) => set({ artifactType: type, artifactContent: content }),
  clearArtifact: () => set({ artifactType: null, artifactContent: '' })
}))
