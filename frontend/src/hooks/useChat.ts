import { useCallback, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useChatStore, type Message } from '@/store/chatStore'
import { useCanvasStore } from '@/store/canvasStore'
import { sendMessage, type ApiMessage } from '@/services/api'
import { getDefaultModel } from '@/utils/config'
import { generateId } from '@/utils/storage' // 仅保留 generateId，移除 LocalStorage 相关引用

export function useChat() {
  const navigate = useNavigate()
  const [activeExpertId, setActiveExpertId] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const { setArtifact } = useCanvasStore()

  const {
    messages,
    addMessage,
    updateMessage,
    isTyping,
    setIsTyping,
    inputMessage,
    setInputMessage,
    selectedAgentId,
    currentConversationId,
    setCurrentConversationId,
    getCurrentAgent
  } = useChatStore()

  // 发送消息核心逻辑
  const handleSendMessage = useCallback(async (content?: string) => {
    const userContent = content || inputMessage
    if (!userContent.trim()) return

    console.log('[useChat] handleSendMessage called:', { userContent, currentConversationId, content })

    // 1. 添加用户消息
    addMessage({ role: 'user', content: userContent })
    setInputMessage('')
    setIsTyping(true)

    // 创建新的 AbortController
    abortControllerRef.current = new AbortController()

    try {
      // 2. 准备请求数据 - 使用当前消息状态 + 用户消息
      const currentMessages = useChatStore.getState().messages
      const chatMessages: ApiMessage[] = currentMessages
        .filter((m: Message) => m.role === 'user' || m.role === 'assistant')
        .map((m: Message) => ({
          role: m.role,
          content: m.content
        }))

      console.log('[useChat] Preparing request:', { chatMessages, selectedAgentId, currentConversationId })

      // 3. 预先添加 AI 空消息（占位）
      const assistantMessageId = generateId()
      addMessage({
        id: assistantMessageId,
        role: 'assistant',
        content: ''
      })

      let newConversationId: string | undefined

      // 4. 发送请求并处理流式响应
      console.log('[useChat] 准备调用 sendMessage')
      await sendMessage(
        chatMessages,
        selectedAgentId,
        (chunk, conversationId, expertEvent, artifact) => {
          console.log('[useChat] sendMessage 回调被调用:', { chunk: chunk?.substring(0, 50), conversationId, expertEvent, hasArtifact: !!artifact })
          // 处理专家事件
          if (expertEvent?.type === 'expert_activated') {
            console.log('[useChat] ✅ 专家激活:', expertEvent.expertId)
            setActiveExpertId(expertEvent.expertId)
          } else if (expertEvent?.type === 'expert_completed') {
            console.log('[useChat] ✅ 专家完成:', expertEvent.expertId)
            // 专家完成时不清除状态，等待下一个专家激活
          }

          // 处理 artifact 事件
          if (artifact) {
            console.log('[useChat] 收到 artifact:', artifact.type)
            console.log('[useChat] Artifact language:', artifact.language)
            console.log('[useChat] Artifact content length:', artifact.content?.length || 0)
            console.log('[useChat] Artifact content preview:', artifact.content?.substring(0, 100))
            // 更新 Canvas 显示代码
            setArtifact(artifact.type, artifact.content)
          }

          // 实时更新 assistant 消息
          if (chunk) {
            updateMessage(assistantMessageId, chunk, true)
          }

          // 如果后端返回了新的 conversationId，保存它
          if (conversationId && !newConversationId) {
            console.log('[useChat] Received conversationId from backend:', conversationId)
            newConversationId = conversationId
          }
        },
        currentConversationId,
        abortControllerRef.current.signal
      )

      // 5. 更新会话状态和 URL
      // 如果是新会话，后端会创建 ID 并通过流式返回（或我们需要手动更新状态）
      if (newConversationId && !currentConversationId) {
        console.log('[useChat] Updating conversation ID and URL:', newConversationId)
        // 使用 replace: true 替换当前的历史记录
        // 注意：这里 navigate 需要在组件中调用，hook 中使用的 navigate 是有效的
        // 但如果这时组件已经卸载了怎么办？（通常不会，因为我们在 ChatPage）
        setCurrentConversationId(newConversationId)
        navigate(`/chat/${newConversationId}`, { replace: true })
      }

    } catch (error) {
      // 检查是否是用户手动取消
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('[useChat] 请求已取消')
        // 移除空的 AI 消息（如果没有内容）
        updateMessage(assistantMessageId, '', false)
      } else {
        console.error('Failed to send message:', error)
        addMessage({
          role: 'assistant',
          content: '抱歉，发生了错误。请检查网络连接或稍后重试。'
        })
      }
    } finally {
      setIsTyping(false)
      abortControllerRef.current = null
    }
  }, [inputMessage, messages, selectedAgentId, currentConversationId, getCurrentAgent, addMessage, setInputMessage, setIsTyping, updateMessage, setCurrentConversationId, navigate])

  // 停止生成
  const handleStopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      console.log('[useChat] 停止生成')
      abortControllerRef.current.abort()
    }
  }, [])

  return {
    messages,
    isTyping,
    inputMessage,
    setInputMessage,
    handleSendMessage,
    handleStopGeneration,
    activeExpertId,
    setActiveExpertId
  }
}
