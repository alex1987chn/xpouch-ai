import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { type Agent, type ThinkingStep } from '@/types'
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
  inputMessage: string

  // ✅ 新增：生成状态（用于替代 useChatCore 中的局部状态）
  isGenerating: boolean
  
  // 👈 新增：数据缓存（防止重复请求）
  conversationsCache: Conversation[] | null
  agentsCache: Agent[] | null
  isLoadingConversations: boolean
  isLoadingAgents: boolean
  lastConversationsFetch: number
  lastAgentsFetch: number

  // 动作 (Actions)
  setSelectedAgentId: (id: string) => void
  setMessages: (messages: Message[] | ((prev: Message[]) => Message[])) => void
  addMessage: (message: Message) => void
  updateMessage: (id: string, content: string, append?: boolean) => void
  updateMessageMetadata: (id: string, metadata: Partial<Message['metadata']>) => void
  /**
   * 🔥 更新最后一条消息的 thinking 步骤
   * 用于 Server-Driven UI 思维链显示
   */
  updateLastMessageThoughts: (step: ThinkingStep) => void
  /**
   * 🔥🔥🔥 v3.5 HITL: 根据任务计划重建 thinking 步骤
   */
  rebuildThinkingFromPlan: (taskIds: string[]) => void
  setInputMessage: (input: string) => void
  setCurrentConversationId: (id: string | null) => void
  addCustomAgent: (agent: Agent) => void
  setCustomAgents: (agents: Agent[] | ((prev: Agent[]) => Agent[])) => void
  
  // ✅ 新增：生成状态控制
  setGenerating: (value: boolean) => void
  
  // 👈 新增：缓存控制
  setConversationsCache: (conversations: Conversation[]) => void
  setAgentsCache: (agents: Agent[]) => void
  invalidateConversationsCache: () => void
  invalidateAgentsCache: () => void
  setLoadingConversations: (loading: boolean) => void
  setLoadingAgents: (loading: boolean) => void
  
  // Getters
  getAllAgents: () => Agent[]
  getCurrentAgent: () => Agent | undefined
  // 👈 新增：缓存获取器
  shouldFetchConversations: () => boolean
  shouldFetchAgents: () => boolean
}

// 缓存有效期：5分钟
const CACHE_TTL = 5 * 60 * 1000

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      // 初始状态
      selectedAgentId: 'default-chat',
      customAgents: [],
      messages: [],
      currentConversationId: null,
      inputMessage: '',
      isGenerating: false,  // ✅ 新增：初始为 false
      
      // 👈 新增：缓存初始状态
      conversationsCache: null,
      agentsCache: null,
      isLoadingConversations: false,
      isLoadingAgents: false,
      lastConversationsFetch: 0,
      lastAgentsFetch: 0,

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

      /**
       * 🔥 更新最后一条消息的 thinking 步骤
       * 如果 step.id 已存在，则更新状态；如果不存在，则 append 到数组末尾
       */
      updateLastMessageThoughts: (step: ThinkingStep) => set((state: ChatState) => {
        // 找到最后一条 assistant 消息
        const lastMessageIndex = [...state.messages].reverse().findIndex(m => m.role === 'assistant')
        if (lastMessageIndex === -1) return { messages: state.messages }
        
        const actualIndex = state.messages.length - 1 - lastMessageIndex
        const lastMessage = state.messages[actualIndex]
        
        // 获取现有的 thinking 数组
        const existingThinking = lastMessage.metadata?.thinking || []
        
        // 查找是否已存在相同 id 的 step
        const existingIndex = existingThinking.findIndex((s: ThinkingStep) => s.id === step.id)
        
        let newThinking: ThinkingStep[]
        if (existingIndex >= 0) {
          // 更新现有 step
          newThinking = [...existingThinking]
          newThinking[existingIndex] = { ...newThinking[existingIndex], ...step }
        } else {
          // 追加新 step
          newThinking = [...existingThinking, step]
        }
        
        // 更新消息
        const updatedMessages = state.messages.map((msg, idx) => {
          if (idx === actualIndex) {
            return {
              ...msg,
              metadata: {
                ...msg.metadata,
                thinking: newThinking
              }
            }
          }
          return msg
        })
        
        return { messages: updatedMessages }
      }),

      /**
       * 🔥🔥🔥 v3.5 HITL: 根据新的任务计划重建 thinking 步骤
       * 用户删除任务后，移除对应的 thinking 步骤
       */
      rebuildThinkingFromPlan: (taskIds: string[]) => set((state: ChatState) => {
        // 找到最后一条 assistant 消息
        const lastMessageIndex = [...state.messages].reverse().findIndex(m => m.role === 'assistant')
        if (lastMessageIndex === -1) return { messages: state.messages }
        
        const actualIndex = state.messages.length - 1 - lastMessageIndex
        const lastMessage = state.messages[actualIndex]
        
        // 获取现有的 thinking 数组
        const existingThinking = lastMessage.metadata?.thinking || []
        
        // 🔥 过滤：只保留 plan 步骤和在 taskIds 中的任务步骤
        const newThinking = existingThinking.filter((step: ThinkingStep) => {
          // 保留 planning 步骤（id 以 plan- 开头）
          if (step.id?.startsWith('plan-')) return true
          // 保留在任务列表中的步骤
          return taskIds.includes(step.id)
        })
        
        // 如果数量变了，更新消息
        if (newThinking.length !== existingThinking.length) {
          console.log('[HITL] thinking 步骤已更新:', {
            before: existingThinking.length,
            after: newThinking.length,
            removed: existingThinking.filter(s => !newThinking.includes(s)).map(s => s.id)
          })
          const updatedMessages = state.messages.map((msg, idx) => {
            if (idx === actualIndex) {
              return {
                ...msg,
                metadata: {
                  ...msg.metadata,
                  thinking: newThinking
                }
              }
            }
            return msg
          })
          return { messages: updatedMessages }
        }
        
        console.log('[HITL] thinking 步骤无需更新:', existingThinking.length)
        return { messages: state.messages }
      }),

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
      
      // 👈 新增：缓存操作
      setConversationsCache: (conversations: Conversation[]) => set({
        conversationsCache: conversations,
        lastConversationsFetch: Date.now(),
        isLoadingConversations: false,
      }),
      
      setAgentsCache: (agents: Agent[]) => set({
        agentsCache: agents,
        lastAgentsFetch: Date.now(),
        isLoadingAgents: false,
      }),
      
      invalidateConversationsCache: () => set({
        conversationsCache: null,
        lastConversationsFetch: 0,
      }),
      
      invalidateAgentsCache: () => set({
        agentsCache: null,
        lastAgentsFetch: 0,
      }),
      
      setLoadingConversations: (loading: boolean) => set({ isLoadingConversations: loading }),
      setLoadingAgents: (loading: boolean) => set({ isLoadingAgents: loading }),

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
        } else {
          // 自定义智能体
          return state.customAgents.find(a => a.id === state.selectedAgentId)
        }
      },
      
      // 👈 新增：缓存判断
      shouldFetchConversations: () => {
        const state = get()
        if (state.isLoadingConversations) return false
        if (!state.conversationsCache) return true
        return Date.now() - state.lastConversationsFetch > CACHE_TTL
      },
      
      shouldFetchAgents: () => {
        const state = get()
        if (state.isLoadingAgents) return false
        if (!state.agentsCache) return true
        return Date.now() - state.lastAgentsFetch > CACHE_TTL
      }
    }),
    {
      name: 'xpouch-chat-store', // LocalStorage key
      // 🔥 修复：重新添加 messages 持久化，保留 thinking 等 metadata
      // 注意：如果消息过多，可能需要定期清理或限制数量
      partialize: (state) => ({
        selectedAgentId: state.selectedAgentId,
        customAgents: state.customAgents,
        messages: state.messages.slice(-50), // 只保留最近50条消息
        currentConversationId: state.currentConversationId,
      })
    }
  )
)
