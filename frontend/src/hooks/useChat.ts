import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useChatStore, type Message } from '@/store/chatStore'
import { sendMessage, type ChatMessage } from '@/services/api'
import { getDefaultModel } from '@/utils/config'
import { generateId } from '@/utils/storage' // 仅保留 generateId，移除 LocalStorage 相关引用

export function useChat() {
  const navigate = useNavigate()
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

    const currentAgent = getCurrentAgent()
    const modelId = currentAgent?.modelId || getDefaultModel()

    // 1. 添加用户消息
    addMessage({ role: 'user', content: userContent })
    setInputMessage('')
    setIsTyping(true)

    try {
      // 2. 准备请求数据 - 使用当前消息状态 + 用户消息
      const currentMessages = useChatStore.getState().messages
      const chatMessages: ChatMessage[] = currentMessages
        .filter((m: Message) => m.role === 'user' || m.role === 'assistant')
        .map((m: Message) => ({
          role: m.role as 'user' | 'assistant',
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
      await sendMessage(
        modelId,
        chatMessages,
        selectedAgentId,
        (chunk, conversationId) => {
          // 实时更新 assistant 消息
          updateMessage(assistantMessageId, chunk, true)

          // 如果后端返回了新的 conversationId，保存它
          if (conversationId && !newConversationId) {
            console.log('[useChat] Received conversationId from backend:', conversationId)
            newConversationId = conversationId
          }
        },
        currentConversationId
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
      console.error('Failed to send message:', error)
      addMessage({
        role: 'assistant',
        content: '抱歉，发生了错误。请检查网络连接或稍后重试。'
      })
    } finally {
      setIsTyping(false)
    }
  }, [inputMessage, messages, selectedAgentId, currentConversationId, getCurrentAgent, addMessage, setInputMessage, setIsTyping, updateMessage, setCurrentConversationId, navigate])

  return {
    messages,
    isTyping,
    inputMessage,
    setInputMessage,
    handleSendMessage
  }
}
