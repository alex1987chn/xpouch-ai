/**
 * Artifact 处理 Hook
 * 负责 Artifact 的创建、解析和会话管理
 */

import { useCallback } from 'react'
import { useCanvasStore } from '@/store/canvasStore'
import type { Artifact } from '@/types'
import { parseAssistantMessage, shouldDisplayAsArtifact } from '@/utils/artifactParser'
import { generateUUID } from '@/utils'
import { logger } from '@/utils/logger'

// 开发环境判断
const DEBUG = import.meta.env.VITE_DEBUG_MODE === 'true'

// 统一的调试日志函数
const debug = DEBUG
  ? (...args: unknown[]) => logger.debug('[useArtifactHandler]', ...args)
  : () => {}

/**
 * Artifact 处理 Hook
 */
export function useArtifactHandler() {
  const {
    addArtifact,
    addArtifactsBatch,
    selectArtifactSession,
    updateExpertResult,
    activeExpertId,
  } = useCanvasStore()

  /**
   * 创建完整的 Artifact 对象
   */
  const createArtifact = useCallback((
    type: Artifact['type'],
    title: string,
    content: string,
    language?: string
  ): Artifact => {
    return {
      id: generateUUID(),
      timestamp: new Date().toISOString(),
      type,
      title,
      content,
      language
    }
  }, [])

  /**
   * 处理流式响应中的 Artifact 事件
   */
  const handleStreamArtifact = useCallback((
    artifact: Artifact,
    expertId: string
  ) => {
    debug('收到 artifact:', artifact.type, 'expertId:', expertId)
    debug('Artifact language:', artifact.language)
    debug('Artifact content length:', artifact.content?.length || 0)
    debug('Artifact content preview:', artifact.content?.substring(0, 100))

    // 创建完整的 Artifact 对象
    const fullArtifact = createArtifact(
      artifact.type,
      artifact.title,
      artifact.content,
      artifact.language
    )

    // 添加到 ArtifactSession
    addArtifact(expertId, fullArtifact)
    debug('已添加 artifact 到 ArtifactSession:', expertId, 'type:', artifact.type)

    // 自动选中该专家的 session，以便在 artifact 区域查看
    selectArtifactSession(expertId)
    debug('自动选中 artifact session:', expertId)

    // 如果有当前激活的专家，更新其 artifact 信息
    if (activeExpertId) {
      updateExpertResult(activeExpertId, {
        artifact: fullArtifact
      })
    }
  }, [createArtifact, addArtifact, selectArtifactSession, updateExpertResult, activeExpertId])

  /**
   * 从助手消息中解析并创建 Artifacts
   */
  const parseAndCreateArtifacts = useCallback((
    content: string,
    expertType: string,
    conversationMode: 'simple' | 'complex'
  ) => {
    if (!content || !shouldDisplayAsArtifact(content)) {
      return
    }

    // 解析助手消息内容
    const artifacts = parseAssistantMessage(content, expertType)

    if (artifacts.length > 0) {
      debug(`成功解析出 ${artifacts.length} 个 artifact，expertType: ${expertType}`)

      // 转换为完整的 Artifact 对象
      const fullArtifacts: Artifact[] = artifacts.map(art => ({
        id: generateUUID(),
        timestamp: new Date().toISOString(),
        ...art
      }))

      // 批量添加到 ArtifactSession
      addArtifactsBatch(expertType, fullArtifacts)

      // 在简单模式下，自动选中 artifact session
      if (conversationMode === 'simple') {
        selectArtifactSession(expertType)
        debug(`简单模式创建 ${fullArtifacts.length} 个 artifacts`)
      }
    }
  }, [addArtifactsBatch, selectArtifactSession])

  /**
   * 从历史会话恢复 Artifacts
   */
  const restoreArtifacts = useCallback((
    expertType: string,
    subTaskArtifacts: Array<{
      type: Artifact['type']
      title: string
      content: string
      language?: string
      timestamp?: string
    }>
  ) => {
    if (!subTaskArtifacts || subTaskArtifacts.length === 0) {
      return
    }

    const artifacts: Artifact[] = subTaskArtifacts.map(item => ({
      id: generateUUID(),
      timestamp: item.timestamp || new Date().toISOString(),
      type: item.type,
      title: item.title,
      content: item.content,
      language: item.language
    }))

    addArtifactsBatch(expertType, artifacts)
    debug(`从历史会话恢复 ${artifacts.length} 个 artifacts，expertType: ${expertType}`)
  }, [addArtifactsBatch])

  return {
    createArtifact,
    handleStreamArtifact,
    parseAndCreateArtifacts,
    restoreArtifacts,
  }
}
