import { createContext, useContext, ReactNode } from 'react'
import { useCanvasStore } from '@/store/canvasStore'
import type { Artifact, ArtifactSession } from '@/types'
import { generateId } from '@/utils/storage'

// ============================================
// ArtifactProvider - 统一管理 Artifact 状态
// ============================================

interface ArtifactContextType {
  // 获取当前选中的专家会话
  currentSession: ArtifactSession | null

  // 获取当前展示的 Artifact
  currentArtifact: Artifact | null

  // 切换专家会话
  selectExpert: (expertType: string | null) => void

  // 切换 Artifact 索引（Tab 切换）
  switchArtifact: (index: number) => void

  // 添加单个 Artifact
  addArtifact: (expertType: string, artifact: Omit<Artifact, 'id' | 'timestamp'>) => void

  // 批量添加 Artifacts
  addArtifactsBatch: (expertType: string, artifacts: Omit<Artifact, 'id' | 'timestamp'>[]) => void

  // 清空所有会话
  clearSessions: () => void
}

const ArtifactContext = createContext<ArtifactContextType | undefined>(undefined)

export function ArtifactProvider({ children }: { children: ReactNode }) {
  const {
    artifactSessions,
    selectedExpertSession,
    selectArtifactSession,
    switchArtifactIndex,
    addArtifact: storeAddArtifact,
    addArtifactsBatch: storeAddArtifactsBatch,
    clearArtifactSessions
  } = useCanvasStore()

  // 获取当前选中的专家会话
  const currentSession: ArtifactSession | null = selectedExpertSession
    ? artifactSessions.find(s => s.expertType === selectedExpertSession) || null
    : null

  // 获取当前展示的 Artifact
  const currentArtifact: Artifact | null = currentSession
    ? currentSession.artifacts[currentSession.currentIndex] || null
    : null

  // 切换专家会话
  const selectExpert = (expertType: string | null) => {
    selectArtifactSession(expertType)
  }

  // 切换 Artifact 索引（Tab 切换）
  const switchArtifact = (index: number) => {
    if (!selectedExpertSession) return
    switchArtifactIndex(selectedExpertSession, index)
  }

  // 添加单个 Artifact
  const addArtifact = (expertType: string, artifact: Omit<Artifact, 'id' | 'timestamp'>) => {
    const fullArtifact: Artifact = {
      ...artifact,
      id: generateId(),
      timestamp: new Date().toISOString()
    }
    storeAddArtifact(expertType, fullArtifact)
  }

  // 批量添加 Artifacts
  const addArtifactsBatch = (expertType: string, artifacts: Omit<Artifact, 'id' | 'timestamp'>[]) => {
    const fullArtifacts: Artifact[] = artifacts.map(artifact => ({
      ...artifact,
      id: generateId(),
      timestamp: new Date().toISOString()
    }))
    storeAddArtifactsBatch(expertType, fullArtifacts)
  }

  // 清空所有会话
  const clearSessions = () => {
    clearArtifactSessions()
  }

  const value: ArtifactContextType = {
    currentSession,
    currentArtifact,
    selectExpert,
    switchArtifact,
    addArtifact,
    addArtifactsBatch,
    clearSessions
  }

  return (
    <ArtifactContext.Provider value={value}>
      {children}
    </ArtifactContext.Provider>
  )
}

// Hook: 使用 Artifact 上下文
export function useArtifacts() {
  const context = useContext(ArtifactContext)
  if (!context) {
    throw new Error('useArtifacts must be used within an ArtifactProvider')
  }
  return context
}
