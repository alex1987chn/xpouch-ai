import { useEffect, useRef, useCallback } from 'react'
import { useCanvasStore } from '@/store/canvasStore'
import { logger } from '@/utils/logger'

interface ArtifactUpdate {
  type: 'code' | 'mermaid' | 'markdown'
  content: string
  sessionId?: string
}

interface UseArtifactListenerProps {
  conversationId?: string
  enabled?: boolean
  onArtifactUpdate?: (artifact: ArtifactUpdate) => void
}

export function useArtifactListener({
  conversationId,
  enabled = true,
  onArtifactUpdate
}: UseArtifactListenerProps) {
  const eventSourceRef = useRef<EventSource | null>(null)
  const { setArtifact, artifactType, artifactContent } = useCanvasStore()

  const connect = useCallback(() => {
    if (!conversationId || !enabled) return

    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    // Create new SSE connection
    const params = new URLSearchParams({ sessionId: conversationId })
    const url = `/api/sse/artifact?${params.toString()}`

    try {
      const eventSource = new EventSource(url)
      eventSourceRef.current = eventSource

      eventSource.onerror = (error) => {
        logger.error('[useArtifactListener] SSE connection error:', error)
        // Reconnect after 3 seconds
        setTimeout(() => {
          if (eventSourceRef.current === eventSource) {
            connect()
          }
        }, 3000)
      }

      eventSource.addEventListener('artifact_update', (event: MessageEvent) => {
        try {
          const data: ArtifactUpdate = JSON.parse(event.data)

          // Update store
          setArtifact(data.type, data.content)

          // Call callback
          onArtifactUpdate?.(data)
        } catch (error) {
          logger.error('[useArtifactListener] Failed to parse artifact_update:', error)
        }
      })

      eventSource.addEventListener('artifact_complete', () => {
        // Artifact streaming complete
      })

      eventSource.addEventListener('error', (event: MessageEvent) => {
        logger.error('[useArtifactListener] Server error:', event.data)
      })
    } catch (error) {
      logger.error('[useArtifactListener] Failed to create SSE connection:', error)
    }
  }, [conversationId, enabled, setArtifact, onArtifactUpdate])

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
  }, [])

  // Connect on mount
  useEffect(() => {
    connect()

    return () => {
      disconnect()
    }
  }, [connect, disconnect])

  // Reconnect when conversationId changes
  useEffect(() => {
    if (conversationId) {
      connect()
    }
  }, [conversationId, connect])

  return {
    artifactType,
    artifactContent,
    connect,
    disconnect
  }
}

// Hook for manual artifact updates (for testing or manual control)
export function useManualArtifact() {
  const { setArtifact, clearArtifact, artifactType, artifactContent } = useCanvasStore()

  const updateArtifact = useCallback((type: 'code' | 'mermaid' | 'markdown' | null, content: string) => {
    setArtifact(type, content)
  }, [setArtifact])

  return {
    artifactType,
    artifactContent,
    updateArtifact,
    clearArtifact
  }
}
