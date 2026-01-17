import { useRef, useEffect } from 'react'
import { useParams, useSearchParams, useLocation, useNavigate } from 'react-router-dom'
import { useChatStore } from '@/store/chatStore'
import { useChat } from '@/hooks/useChat'
import ChatGPTChatArea from '@/components/ChatGPTChatArea'
import GlowingInput from '@/components/GlowingInput'
import { AgentHeader } from '@/components/AgentHeader'
import { useTranslation } from '@/i18n'
import { getConversation } from '@/services/api'
import { generateId } from '@/utils/storage' // 依然用于生成临时ID

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

        console.log('[ChatPage] Checking load:', { id, currentStoreId, msgCount: currentMessages.length });

        if (currentStoreId === id && currentMessages.length > 0) {
            console.log('[ChatPage] Skipping load, data already in store');
            return;
        }

        console.log('[ChatPage] Loading from API:', id);
        // 从 API 加载
        getConversation(id).then(conversation => {
            if (conversation) {
                setSelectedAgentId(conversation.agent_id)
                setCurrentConversationId(conversation.id)

                // 恢复消息
                // 后端返回的 messages 数组
                if (conversation.messages && conversation.messages.length > 0) {
                    const loadedMessages = conversation.messages.map((m: any) => ({
                        role: m.role,
                        content: m.content,
                        id: m.id ? String(m.id) : generateId(),
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
                console.log('[ChatPage] Conversation not found, treating as new conversation:', id)
                // 这是临时 ID 或不存在的会话，清空消息列表
                setMessages([])
                setCurrentConversationId(null)
            } else {
                console.error("Failed to load conversation", err)
                // 其他错误，跳转到新建会话
                const newId = generateId()
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
      // Send the message immediately
      handleSendMessage(state.startWith)
      
      // Clear the state to prevent re-sending if navigating back
      // Using replace to keep the same history entry but clear state
      navigate(location.pathname + location.search, { replace: true, state: {} })
    }
  }, [location, handleSendMessage, isTyping, navigate])

  return (
    <div className="flex flex-col h-full relative">
      <AgentHeader
        agentName={getCurrentAgent()?.name || 'AI'}
        agentCategory={getCurrentAgent()?.category}
      />

      <div className="flex-1 overflow-auto px-4" ref={messagesContainerRef}>
        <ChatGPTChatArea messages={messages} isTyping={isTyping} />
      </div>

      <div className="pb-6 px-4 shrink-0">
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
