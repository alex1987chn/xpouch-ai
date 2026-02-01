import { create } from 'zustand'
import type { Artifact, ArtifactSession } from '@/types'

// 专家结果类型
export interface ExpertResult {
  expertType: string
  expertName: string
  description: string
  title?: string  // AI 返回的自定义标题
  status: 'pending' | 'running' | 'completed' | 'failed'
  output?: string
  artifact?: Artifact  // 单个交付物（向后兼容）
  artifacts?: Artifact[]  // 多个交付物（新架构）
  duration?: number
  error?: string
  startedAt?: string
  completedAt?: string
}

interface CanvasState {
  // Artifact 状态管理（保留向后兼容）
  artifactType: 'code' | 'markdown' | 'search' | 'html' | 'text' | null
  artifactContent: string
  setArtifact: (type: 'code' | 'markdown' | 'search' | 'html' | 'text' | null, content: string) => void
  clearArtifact: () => void

  // ArtifactSession 管理（新架构）
  artifactSessions: ArtifactSession[]  // 每个专家的交付物会话
  selectedExpertSession: string | null  // 当前选中的专家类型

  // ArtifactSession 操作
  getArtifactSession: (expertType: string) => ArtifactSession | undefined
  addArtifact: (expertType: string, artifact: Artifact) => void
  addArtifactsBatch: (expertType: string, artifacts: Artifact[]) => void
  selectArtifactSession: (expertType: string | null) => void
  switchArtifactIndex: (expertType: string, index: number) => void
  clearArtifactSessions: () => void
  // Simple 模式预览 - 替换现有内容（而不是添加）
  setSimplePreview: (artifact: Artifact) => void

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
  // Artifact 状态管理（保留向后兼容）
  artifactType: null,
  artifactContent: '',
  setArtifact: (type, content) => {
    set({ artifactType: type, artifactContent: content })
  },
  clearArtifact: () => {
    set({ artifactType: null, artifactContent: '' })
  },

  // ArtifactSession 管理（新架构）
  artifactSessions: [],
  selectedExpertSession: null,

  getArtifactSession: (expertType) => {
    return useCanvasStore.getState().artifactSessions.find(
      session => session.expertType === expertType
    )
  },

  addArtifact: (expertType, artifact) => set(state => {
    const now = new Date().toISOString()
    const existingIndex = state.artifactSessions.findIndex(
      session => session.expertType === expertType
    )

    if (existingIndex >= 0) {
      // 更新现有会话
      const updatedSessions = [...state.artifactSessions]
      updatedSessions[existingIndex] = {
        ...updatedSessions[existingIndex],
        artifacts: [...updatedSessions[existingIndex].artifacts, artifact],
        currentIndex: updatedSessions[existingIndex].artifacts.length,  // 切换到新添加的 artifact
        updatedAt: now
      }
      // 自动选中该 expert session 和 expert
      return { 
        artifactSessions: updatedSessions,
        selectedExpertSession: expertType,
        selectedExpert: expertType
      }
    } else {
      // 创建新会话
      const newSession: ArtifactSession = {
        expertType,
        artifacts: [artifact],
        currentIndex: 0,
        createdAt: now,
        updatedAt: now
      }
      // 自动选中第一个 expert session 和 expert
      return { 
        artifactSessions: [...state.artifactSessions, newSession],
        selectedExpertSession: expertType,
        selectedExpert: expertType
      }
    }
  }),

  addArtifactsBatch: (expertType, artifacts) => set(state => {
    const now = new Date().toISOString()
    const existingIndex = state.artifactSessions.findIndex(
      session => session.expertType === expertType
    )

    if (existingIndex >= 0) {
      // 更新现有会话
      const updatedSessions = [...state.artifactSessions]
      updatedSessions[existingIndex] = {
        ...updatedSessions[existingIndex],
        artifacts: [...updatedSessions[existingIndex].artifacts, ...artifacts],
        updatedAt: now
      }
      // 自动选中该 expert session 和 expert
      return { 
        artifactSessions: updatedSessions,
        selectedExpertSession: expertType,
        selectedExpert: expertType
      }
    } else {
      // 创建新会话
      const newSession: ArtifactSession = {
        expertType,
        artifacts,
        currentIndex: 0,
        createdAt: now,
        updatedAt: now
      }
      // 自动选中第一个 expert session 和 expert
      return { 
        artifactSessions: [...state.artifactSessions, newSession],
        selectedExpertSession: expertType,
        selectedExpert: expertType
      }
    }
  }),

  selectArtifactSession: (expertType) => set({ selectedExpertSession: expertType }),

  switchArtifactIndex: (expertType, index) => set(state => {
    return {
      artifactSessions: state.artifactSessions.map(session =>
        session.expertType === expertType
          ? { ...session, currentIndex: index }
          : session
      )
    }
  }),

  clearArtifactSessions: () => set({ artifactSessions: [], selectedExpertSession: null }),

  // Simple 模式预览 - 替换现有内容（而不是添加新的）
  setSimplePreview: (artifact) => set(state => {
    const now = new Date().toISOString()
    const expertType = 'simple'
    const existingIndex = state.artifactSessions.findIndex(
      session => session.expertType === expertType
    )

    if (existingIndex >= 0) {
      // 替换现有 session 的内容（只保留当前这个 artifact）
      const updatedSessions = [...state.artifactSessions]
      updatedSessions[existingIndex] = {
        ...updatedSessions[existingIndex],
        artifacts: [artifact],  // 替换为新的 artifact
        currentIndex: 0,  // 重置到第一个
        updatedAt: now
      }
      return { 
        artifactSessions: updatedSessions,
        selectedExpertSession: expertType,
        selectedExpert: expertType
      }
    } else {
      // 创建新的 session
      const newSession: ArtifactSession = {
        expertType,
        artifacts: [artifact],
        currentIndex: 0,
        createdAt: now,
        updatedAt: now
      }
      return { 
        artifactSessions: [...state.artifactSessions, newSession],
        selectedExpertSession: expertType,
        selectedExpert: expertType
      }
    }
  }),

  // 专家结果状态管理
  expertResults: [],
  selectedExpert: null,
  addExpertResult: (result) => set(state => {
    // 移除同类型的旧记录，只保留最新的
    const filtered = state.expertResults.filter(
      expert => expert.expertType !== result.expertType
    )
    return { expertResults: [...filtered, result] }
  }),
  updateExpertResult: (expertType, updates) => set(state => ({
    expertResults: state.expertResults.map(expert =>
      expert.expertType === expertType ? { ...expert, ...updates } : expert
    )
  })),
  selectExpert: (expertType) => {
    set({ selectedExpert: expertType })
  },
  clearExpertResults: () => set({ expertResults: [], selectedExpert: null }),
  retryExpert: (expertType) => {
    // TODO: 实现重试逻辑
    set(state => ({
      expertResults: state.expertResults.map(expert =>
        expert.expertType === expertType ? { ...expert, status: 'pending', error: undefined } : expert
      )
    }))
  }
}))
