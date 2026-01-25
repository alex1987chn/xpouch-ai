import { useRef, useEffect } from 'react'
import { useParams, useSearchParams, useLocation, useNavigate } from 'react-router-dom'
import { useChatStore } from '@/store/chatStore'
import { useChat } from '@/hooks/useChat'
import ChatGPTChatArea from '@/components/ChatGPTChatArea'
import GlowingInput from '@/components/GlowingInput'
import { AgentHeader } from '@/components/AgentHeader'
import { useTranslation } from '@/i18n'
import { getConversation, type ApiMessage } from '@/services/api'
import { dbMessageToMessage } from '@/types'
import { type ChatPageState } from '@/types'
import { SYSTEM_AGENTS } from '@/constants/agents'

export default function ChatPage() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const agentIdFromUrl = searchParams.get('agentId')
  const location = useLocation()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  
  // Ref to track if we've handled the startWith message to prevent double sending
  const handledStartWithRef = useRef(false)

  const { 
    messages, 
    isTyping, 
    inputMessage, 
    setInputMessage, 
    handleSendMessage 
  } = useChat()
  
  const { 
    setSelectedAgentId,
    setMessages,
    setCurrentConversationId,
    getCurrentAgent
  } = useChatStore()

  // 初始化或加载会话
  useEffect(() => {
    // 1. 如果是已有会话
    if (id) {
        // 检查是否已经是当前会话（且有消息），避免重复加载覆盖正在生成的消息
        const currentStoreId = useChatStore.getState().currentConversationId;
        const currentMessages = useChatStore.getState().messages;

        if (currentStoreId === id && currentMessages.length > 0) {
            // 修复：总是从数据库加载，确保获取最新消息
            // 清空缓存消息，避免使用localStorage中的旧数据
            console.log('[ChatPage] 清空缓存消息，从数据库重新加载')
            // 不return，继续执行下面的加载逻辑
        }
        // 从 API 加载
        getConversation(id).then(conversation => {
            if (conversation) {
                setSelectedAgentId(conversation.agent_id)
                setCurrentConversationId(conversation.id)

                // 恢复消息
                // 后端返回的 messages 数组
                if (conversation.messages && conversation.messages.length > 0) {
                    const loadedMessages = conversation.messages.map((m: ApiMessage) => ({
                        role: m.role === 'system' ? 'assistant' : m.role,
                        content: m.content,
                        id: m.id ? String(m.id) : crypto.randomUUID(),
                        timestamp: m.timestamp ? new Date(m.timestamp).getTime() : Date.now()
                    }))
                    setMessages(loadedMessages)
                } else {
                    setMessages([])
                }
            }
        }).catch(err => {
            // 检查是否是 404 错误（会话不存在）
            if (err.message?.includes('404') || err.status === 404) {
                // 这是新会话（前端生成的UUID尚未在后端创建），清空消息列表
                setMessages([])
                setCurrentConversationId(id)
                // 设置选中的智能体ID，确保发送消息时使用正确的agentId
                setSelectedAgentId(agentIdFromUrl || SYSTEM_AGENTS.DEFAULT_CHAT)
            } else {
                console.error("Failed to load conversation", err)
                // 其他错误，跳转到新建会话
                const newId = crypto.randomUUID()
                navigate(`/chat/${newId}`, { replace: true })
            }
        })
    }
  }, [id, agentIdFromUrl, setCurrentConversationId, setMessages, setSelectedAgentId, navigate])

  // 自动滚动
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
    }
  }, [messages, isTyping])

  // Handle startWith message from navigation state
  useEffect(() => {
    const state = location.state as { startWith?: string } | null
    if (state?.startWith && !handledStartWithRef.current && !isTyping) {
      handledStartWithRef.current = true
      // 确保当前会话ID正确设置
      const currentStoreId = useChatStore.getState().currentConversationId;
      if (currentStoreId !== id) {
        useChatStore.getState().setCurrentConversationId(id);
      }
      // Send the message immediately
      handleSendMessage(state.startWith)
      
      // Clear the state to prevent re-sending if navigating back
      // Using replace to keep the same history entry but clear state
      navigate(location.pathname + location.search, { replace: true, state: {} })
    }
  }, [location, handleSendMessage, isTyping, navigate, id])

  return (
    <div className="flex flex-col h-full relative">
      <AgentHeader
        agentName={getCurrentAgent()?.name || 'AI'}
        agentCategory={getCurrentAgent()?.category}
      />

      <div className="flex-1 overflow-auto px-4" ref={messagesContainerRef}>
        <ChatGPTChatArea messages={messages} isTyping={isTyping} />
      </div>

      <div className="pb-24 md:pb-20 px-4 shrink-0">
        <div className="relative flex justify-center">
          <div className="w-full max-w-2xl lg:max-w-4xl relative">
            <GlowingInput
              value={inputMessage}
              onChange={setInputMessage}
              onSubmit={handleSendMessage}
              placeholder={t('placeholder')}
              disabled={isTyping}
              isTyping={isTyping}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
