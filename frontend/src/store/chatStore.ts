import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { type Agent } from '@/types'
import { generateId } from '@/utils/storage'
import { type Message, type Conversation } from '@/types'
import { SYSTEM_AGENTS, getSystemAgentName } from '@/constants/agents'

// 定义 Store 状态类型
interface ChatState {
  // 智能体相关
  selectedAgentId: string
  customAgents: Agent[]
  
  // 聊天相关
  messages: Message[]
  currentConversationId: string | null
  isTyping: boolean
  inputMessage: string

  // ✅ 新增：生成状态（用于替代 useChatCore 中的局部状态）
  isGenerating: boolean

  // 动作 (Actions)
  setSelectedAgentId: (id: string) => void
  setMessages: (messages: Message[] | ((prev: Message[]) => Message[])) => void
  addMessage: (message: Message) => void
  updateMessage: (id: string, content: string, append?: boolean) => void
  updateMessageMetadata: (id: string, metadata: Partial<Message['metadata']>) => void
  setIsTyping: (isTyping: boolean) => void
  setInputMessage: (input: string) => void
  setCurrentConversationId: (id: string | null) => void
  addCustomAgent: (agent: Agent) => void
  setCustomAgents: (agents: Agent[] | ((prev: Agent[]) => Agent[])) => void
  
  // ✅ 新增：生成状态控制
  setGenerating: (value: boolean) => void
  
  // Getters
  getAllAgents: () => Agent[]
  getCurrentAgent: () => Agent | undefined
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      // 初始状态
      selectedAgentId: 'default-chat',
      customAgents: [],
      messages: [],
      currentConversationId: null,
      isTyping: false,
      inputMessage: '',
      isGenerating: false,  // ✅ 新增：初始为 false

      // 动作实现
      setSelectedAgentId: (id: string) => set({ selectedAgentId: id }),
      
      setMessages: (messagesOrUpdater: Message[] | ((prev: Message[]) => Message[])) => set((state: ChatState) => {
        const newMessages = typeof messagesOrUpdater === 'function'
          ? messagesOrUpdater(state.messages)
          : messagesOrUpdater

        return { messages: newMessages }
      }),

      addMessage: (message: Message) => set((state: ChatState) => {
        const newMessage = { ...message, id: message.id || generateId(), timestamp: Date.now() }
        const newMessages = [...state.messages, newMessage]
        return { messages: newMessages }
      }),

      updateMessage: (id: string, content: string, append?: boolean) => set((state: ChatState) => {
        const updatedMessages = state.messages.map((msg: Message) => {
          if (msg.id === id) {
            const newContent = append ? (msg.content || '') + content : content
            return { ...msg, content: newContent }
          }
          return msg
        })
        return { messages: updatedMessages }
      }),

      updateMessageMetadata: (id: string, metadata: Partial<Message['metadata']>) => set((state: ChatState) => {
        const updatedMessages = state.messages.map((msg: Message) => {
          if (msg.id === id) {
            return { 
              ...msg, 
              metadata: { ...msg.metadata, ...metadata }
            }
          }
          return msg
        })
        return { messages: updatedMessages }
      }),

      setIsTyping: (isTyping: boolean) => set({ isTyping }),
      
      setInputMessage: (input: string) => set({ inputMessage: input }),

      setCurrentConversationId: (id: string | null) => set({ currentConversationId: id }),

      addCustomAgent: (agent: Agent) => set((state: ChatState) => ({
        customAgents: [agent, ...state.customAgents]
      })),

      setCustomAgents: (agentsOrUpdater: Agent[] | ((prev: Agent[]) => Agent[])) => set((state: ChatState) => ({
        customAgents: typeof agentsOrUpdater === 'function'
          ? agentsOrUpdater(state.customAgents)
          : agentsOrUpdater
      })),

      // ✅ 新增：设置生成状态
      setGenerating: (value: boolean) => set({ isGenerating: value }),

      // Getters
      getAllAgents: () => {
        const state = get()
        // 只返回自定义智能体
        return state.customAgents
      },

      getCurrentAgent: () => {
        const state = get()
        // 根据selectedAgentId判断智能体类型
        if (state.selectedAgentId === SYSTEM_AGENTS.DEFAULT_CHAT) {
          // 默认助手
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
        } else if (state.selectedAgentId === SYSTEM_AGENTS.ORCHESTRATOR) {
          // AI助手
          return {
            id: SYSTEM_AGENTS.ORCHESTRATOR,
            name: getSystemAgentName(SYSTEM_AGENTS.ORCHESTRATOR),
            description: '复杂任务拆解、专家协作、智能聚合',
            category: 'AI',
            isCustom: false,
            is_builtin: false,
            modelId: 'deepseek-chat',
            icon: null,
            systemPrompt: ''
          }
        } else {
          // 自定义智能体
          return state.customAgents.find(a => a.id === state.selectedAgentId)
        }
      }
    }),
    {
      name: 'xpouch-chat-store', // LocalStorage key
      // 只持久化部分字段 (移除 messages，改为从后端获取)
      partialize: (state) => ({
        selectedAgentId: state.selectedAgentId,
        customAgents: state.customAgents,
        // messages: [], // 已经在上面初始值设为空了，这里不需要持久化
        // currentConversationId: null, // 同上
        // isTyping: false, // 同上
        // inputMessage: '' // 同上
      })
    }
  )
)
