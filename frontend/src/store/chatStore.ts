import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { type Agent, agents as defaultAgents } from '@/data/agents'
import { generateId } from '@/utils/storage'

// 定义聊天消息类型
export interface Message {
  id?: string
  role: 'user' | 'assistant'
  content: string
  isTyping?: boolean
  timestamp?: number | string
}

// 定义 Store 状态类型
interface ChatState {
  // 智能体相关
  selectedAgentId: string
  customAgents: Agent[]
  
  // 聊天相关
  messages: Message[]
  currentConversationId: string | null
  lastActiveConversationId: string | null
  isTyping: boolean
  inputMessage: string
  
  // 动作 (Actions)
  setSelectedAgentId: (id: string) => void
  setMessages: (messages: Message[] | ((prev: Message[]) => Message[])) => void
  addMessage: (message: Message) => void
  updateMessage: (id: string, content: string, append?: boolean) => void
  setIsTyping: (isTyping: boolean) => void
  setInputMessage: (input: string) => void
  setCurrentConversationId: (id: string | null) => void
  setLastActiveConversationId: (id: string | null) => void
  addCustomAgent: (agent: Agent) => void
  
  // Getters
  getAllAgents: () => Agent[]
  getCurrentAgent: () => Agent | undefined
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      // 初始状态
      selectedAgentId: 'assistant',
      customAgents: [],
      messages: [],
      currentConversationId: null,
      lastActiveConversationId: null,
      isTyping: false,
      inputMessage: '',

      // 动作实现
      setSelectedAgentId: (id: string) => set({ selectedAgentId: id }),
      
      setMessages: (messagesOrUpdater: Message[] | ((prev: Message[]) => Message[])) => set((state: ChatState) => ({
        messages: typeof messagesOrUpdater === 'function' 
          ? messagesOrUpdater(state.messages) 
          : messagesOrUpdater
      })),

      addMessage: (message: Message) => set((state: ChatState) => ({
        messages: [...state.messages, { ...message, id: message.id || generateId(), timestamp: Date.now() }]
      })),

      updateMessage: (id: string, content: string, append?: boolean) => set((state: ChatState) => ({
        messages: state.messages.map((msg: Message) =>
          msg.id === id
            ? { ...msg, content: append ? (msg.content || '') + content : content }
            : msg
        )
      })),

      setIsTyping: (isTyping: boolean) => set({ isTyping }),
      
      setInputMessage: (input: string) => set({ inputMessage: input }),
      
      setCurrentConversationId: (id: string | null) => set(() => {
        // 当设置当前会话ID时，如果是有效的ID（非null），则更新 lastActiveConversationId
        // 排除 'new' 这种临时状态（虽然通常 new 不会存在 store 的 currentConversationId 中）
        if (id) {
            return { currentConversationId: id, lastActiveConversationId: id }
        }
        return { currentConversationId: id }
      }),

      setLastActiveConversationId: (id: string | null) => set({ lastActiveConversationId: id }),
      
      addCustomAgent: (agent: Agent) => set((state: ChatState) => ({
        customAgents: [...state.customAgents, agent]
      })),

      // Getters
      getAllAgents: () => {
        const state = get()
        return [...defaultAgents, ...state.customAgents]
      },
      
      getCurrentAgent: () => {
        const state = get()
        const allAgents = [...defaultAgents, ...state.customAgents]
        return allAgents.find(a => a.id === state.selectedAgentId)
      }
    }),
    {
      name: 'xpouch-chat-store', // LocalStorage key
      // 只持久化部分字段 (移除 messages，改为从后端获取)
      partialize: (state) => ({
        selectedAgentId: state.selectedAgentId,
        customAgents: state.customAgents,
        lastActiveConversationId: state.lastActiveConversationId,
        // messages: [], // 已经在上面初始值设为空了，这里不需要持久化
        // currentConversationId: null, // 同上
        // isTyping: false, // 同上
        // inputMessage: '' // 同上
      })
    }
  )
)
