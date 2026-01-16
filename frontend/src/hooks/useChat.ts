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

    const currentAgent = getCurrentAgent()
    const modelId = currentAgent?.modelId || getDefaultModel()

    // 1. 添加用户消息
    addMessage({ role: 'user', content: userContent })
    setInputMessage('')
    setIsTyping(true)

    try {
      // 2. 准备请求数据
      // 构建消息历史（包含之前的对话 + 当前用户消息）
      const chatMessages: ChatMessage[] = messages.map((m: Message) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content
      }))
      chatMessages.push({ role: 'user', content: userContent })

      // 3. 预先添加 AI 空消息（占位）
      const assistantMessageId = generateId()
      addMessage({
        id: assistantMessageId,
        role: 'assistant',
        content: ''
      })
      
      let newConversationId: string | undefined

      // 4. 发送请求并处理流式响应
      // 注意：现在我们把 conversationId 传给后端
      await sendMessage(
        modelId, 
        chatMessages, 
        selectedAgentId, 
        (chunk, conversationId) => {
          // 实时更新刚才创建的那条消息
          // 注意：必须获取最新的 messages 状态，而不是闭包中的
          const currentMessages = useChatStore.getState().messages
          const targetMessage = currentMessages.find((m: Message) => m.id === assistantMessageId)
          
          if (targetMessage) {
            updateMessage(assistantMessageId, targetMessage.content + chunk)
          }
          
          // 如果后端返回了新的 conversationId（通常在第一帧或最后一帧），保存它
          if (conversationId && !currentConversationId) {
             newConversationId = conversationId
          }
        },
        currentConversationId
      )

      // 5. 更新会话状态和 URL
      // 如果是新会话，后端会创建 ID 并通过流式返回（或我们需要手动更新状态）
      if (newConversationId && !currentConversationId) {
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
