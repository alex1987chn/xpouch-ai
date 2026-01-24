import { useRef, useCallback, useEffect } from 'react'

export type ExpertEventType = 'content' | 'expert_status' | 'done'

export interface ExpertEvent {
  type: ExpertEventType
  content?: string
  expertId?: string
  expertStatus?: 'active' | 'completed'
}

export function useExpertStream() {
  const activeExpertsRef = useRef<Set<string>>(new Set())
  const onExpertStatusCallbackRef = useRef<((expertId: string, status: 'active' | 'completed') => void) | null>(null)

  // 处理 SSE 流，提取专家状态
  const processSSELine = useCallback((line: string) => {
    const trimmed = line.trim()
    if (!trimmed || !trimmed.startsWith('data: ')) return null

    const data = trimmed.slice(6)

    // 检测完成标记
    if (data === '[DONE]') {
      return {
        type: 'done' as ExpertEventType
      }
    }

    try {
      const parsed = JSON.parse(data)

      // 检测专家状态更新
      if (parsed.activeExpert) {
        return {
          type: 'expert_status' as ExpertEventType,
          expertId: parsed.activeExpert,
          expertStatus: 'active' as 'active' | 'completed'
        }
      }

      // 检测完成状态
      if (parsed.expertCompleted) {
        return {
          type: 'expert_status' as ExpertEventType,
          expertId: parsed.expertCompleted,
          expertStatus: 'completed' as 'active' | 'completed'
        }
      }

      // 普通内容
      if (parsed.content) {
        return {
          type: 'content' as ExpertEventType,
          content: parsed.content
        }
      }
    } catch (e) {
      // JSON 解析失败，跳过
    }

    return null
  }, [])

  // 发送消息并处理专家流
  const sendMessageWithExpertStream = useCallback(async (
    messages: { role: string; content: string }[],
    agentId: string,
    onChunk: (event: ExpertEvent) => void,
    conversationId?: string | null
  ) => {
    const history = messages.slice(0, -1)
    const lastMessage = messages[messages.length - 1]
    const messageContent = lastMessage.content

    try {
      // 使用相对路径，通过 Vite 代理转发到后端
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-ID': getOrGenerateClientId()
        },
        body: JSON.stringify({
          message: messageContent,
          history: history,
          agentId,
          conversationId,
          stream: true
        })
      })

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('Response body is not readable')
      }

      const decoder = new TextDecoder()
      let buffer = ''

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value, { stream: true })
          buffer += chunk
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            const event = processSSELine(line)
            if (event) {
              onChunk(event)

              // 更新活跃专家集合
              if (event.type === 'expert_status' && event.expertStatus === 'active') {
                activeExpertsRef.current.add(event.expertId!)
              } else if (event.type === 'expert_status' && event.expertStatus === 'completed') {
                activeExpertsRef.current.delete(event.expertId!)
              }

              // 回调通知
              if (onExpertStatusCallbackRef.current && event.expertId && event.expertStatus) {
                onExpertStatusCallbackRef.current(event.expertId, event.expertStatus)
              }
            }
          }
        }
      } finally {
        reader.releaseLock()
      }
    } catch (error) {
      throw error
    }
  }, [processSSELine])

  // 设置回调函数
  const setExpertStatusCallback = useCallback((
    callback: (expertId: string, status: 'active' | 'completed') => void
  ) => {
    onExpertStatusCallbackRef.current = callback
  }, [])

  // 清理
  useEffect(() => {
    return () => {
      onExpertStatusCallbackRef.current = null
    }
  }, [])

  return {
    sendMessageWithExpertStream,
    setExpertStatusCallback,
    getActiveExperts: () => activeExpertsRef.current
  }
}

// 辅助函数：获取或生成客户端 ID
function getOrGenerateClientId(): string {
  const STORAGE_KEY = 'xpouch_client_id'
  let clientId = localStorage.getItem(STORAGE_KEY)
  if (!clientId) {
    clientId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0
      const v = c === 'x' ? r : (r & 0x3 | 0x8)
      return v.toString(16)
    })
    localStorage.setItem(STORAGE_KEY, clientId)
  }
  return clientId
}
