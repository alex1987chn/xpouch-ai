import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { type Agent } from '@/types'
import { generateUUID } from '@/utils/uuid'
import { type Message } from '@/types'
import { SYSTEM_AGENTS, getSystemAgentName } from '@/constants/agents'

/**
 * ChatStore - 聊天状态管理
 * 
 * [职责边界]
 * ✅ 当前活跃对话的实时状态（messages, isGenerating）
 * ✅ 用户输入状态（inputMessage）
 * ✅ 智能体选择状态（selectedAgentId）
 * ✅ 用户自定义智能体（customAgents）
 * 
 * ❌ 不负责服务端数据缓存（由 React Query 处理）
 *   - 会话列表 → useChatHistoryQuery
 *   - 智能体列表 → useCustomAgentsQuery
 * 
 * [性能优化]
 * - lastAssistantMessageId: 缓存最后一条助手消息 ID，避免 EventHandler 遍历查找
 */

// ============================================================================
// Types
// ============================================================================

interface ChatState {
  // 智能体相关
  selectedAgentId: string
  customAgents: Agent[]
  
  // 聊天相关
  messages: Message[]
  currentConversationId: string | null
  inputMessage: string

  // 生成状态
  isGenerating: boolean
  
  // 🔥 性能优化：缓存最后一条助手消息 ID
  lastAssistantMessageId: string | null
  
  // 🔐 登录后自动重发消息机制
  pendingMessage: string | null  // 因 401 未发送成功的消息
  shouldRetrySend: boolean       // 触发重试的标志
}

interface ChatActions {
  // 智能体操作
  setSelectedAgentId: (id: string) => void
  addCustomAgent: (agent: Agent) => void
  setCustomAgents: (agents: Agent[] | ((prev: Agent[]) => Agent[])) => void
  
  // 消息操作
  setMessages: (messages: Message[] | ((prev: Message[]) => Message[])) => void
  addMessage: (message: Message) => void
  updateMessage: (id: string, content: string, append?: boolean) => void
  updateMessageMetadata: (id: string, metadata: Partial<Message['metadata']>) => void
  
  // 输入状态
  setInputMessage: (input: string) => void
  
  // 会话状态
  setCurrentConversationId: (id: string | null) => void
  
  // 生成状态
  setGenerating: (value: boolean) => void
  
  // Getters
  getAllAgents: () => Agent[]
  getCurrentAgent: () => Agent | undefined
  
  // 🔐 登录后自动重发消息
  setPendingMessage: (message: string | null) => void
  setShouldRetrySend: (value: boolean) => void
}

type ChatStore = ChatState & ChatActions

// ============================================================================
// Store Factory
// ============================================================================

export const useChatStore = create<ChatStore>()(
  persist(
    (set, get) => ({
      // ========== 初始状态 ==========
      selectedAgentId: 'default-chat',
      customAgents: [],
      messages: [],
      currentConversationId: null,
      inputMessage: '',
      isGenerating: false,
      lastAssistantMessageId: null,
      pendingMessage: null,
      shouldRetrySend: false,

      // ========== 智能体操作 ==========
      
      setSelectedAgentId: (id: string) => set({ selectedAgentId: id }),

      addCustomAgent: (agent: Agent) => set((state) => ({
        customAgents: [agent, ...state.customAgents]
      })),

      setCustomAgents: (agentsOrUpdater) => set((state) => ({
        customAgents: typeof agentsOrUpdater === 'function'
          ? agentsOrUpdater(state.customAgents)
          : agentsOrUpdater
      })),

      // ========== 消息操作 ==========
      
      setMessages: (messagesOrUpdater) => set((state) => {
        const newMessages = typeof messagesOrUpdater === 'function'
          ? messagesOrUpdater(state.messages)
          : messagesOrUpdater
        return { messages: newMessages }
      }),

      addMessage: (message: Message) => set((state) => {
        const newMessage = { ...message, id: message.id || generateUUID(), timestamp: Date.now() }
        const newMessages = [...state.messages, newMessage]
        
        // 🔥 性能优化：更新 lastAssistantMessageId
        const updates: Partial<ChatState> = { messages: newMessages }
        if (message.role === 'assistant') {
          updates.lastAssistantMessageId = newMessage.id
        }
        
        return updates
      }),

      updateMessage: (id: string, content: string, append?: boolean) => set((state) => ({
        messages: state.messages.map((msg) => {
          if (msg.id === id) {
            const newContent = append ? (msg.content || '') + content : content
            return { ...msg, content: newContent }
          }
          return msg
        })
      })),

      updateMessageMetadata: (id: string, metadata: Partial<Message['metadata']>) => set((state) => ({
        messages: state.messages.map((msg) => {
          if (msg.id === id) {
            return { 
              ...msg, 
              metadata: { ...msg.metadata, ...metadata }
            }
          }
          return msg
        })
      })),

      // ========== 输入状态 ==========
      
      setInputMessage: (input: string) => set({ inputMessage: input }),

      // ========== 会话状态 ==========
      
      setCurrentConversationId: (id: string | null) => set({ currentConversationId: id }),

      // ========== 生成状态 ==========
      
      setGenerating: (value: boolean) => set({ isGenerating: value }),

      // ========== Getters ==========
      
      getAllAgents: () => {
        return get().customAgents
      },

      getCurrentAgent: () => {
        const state = get()
        if (state.selectedAgentId === SYSTEM_AGENTS.DEFAULT_CHAT) {
          return {
            id: SYSTEM_AGENTS.DEFAULT_CHAT,
            name: getSystemAgentName(SYSTEM_AGENTS.DEFAULT_CHAT),
            description: '日常对话、通用任务、智能问答',
            category: '通用',
            isCustom: false,
            is_builtin: false,
            modelId: 'deepseek-chat',
            icon: null,
            systemPrompt: ''
          }
        }
        return state.customAgents.find(a => a.id === state.selectedAgentId)
      },

      // ========== 登录后自动重发消息 ==========
      
      setPendingMessage: (message: string | null) => set({ pendingMessage: message }),
      
      setShouldRetrySend: (value: boolean) => set({ shouldRetrySend: value })
    }),
    {
      name: 'xpouch-chat-store',
      partialize: (state) => ({
        selectedAgentId: state.selectedAgentId,
        customAgents: state.customAgents,
        messages: state.messages.slice(-50), // 只保留最近50条消息
        currentConversationId: state.currentConversationId,
      })
    }
  )
)
